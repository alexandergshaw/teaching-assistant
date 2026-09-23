# A32 scope: walkthrough-announcement scheduling (round 2)

Row A32 (`docs/backlog.yml`, `- id: 'A32'`). The gap: the walkthrough
surface's announcement action drops the `delayedPostAt` argument the library
already supports, so an instructor cannot schedule a walkthrough announcement.

**This is round 2 of two.** `docs/a24-a32-check.md` returned NOT BUILDABLE on
round 1 with one blocker and four majors. Every finding was re-measured here
before being acted on; three of the check's own claims are corrected below,
two of them materially. Under `AGENTS.md`'s "Two rounds, then ask", the one
thing this pass cannot settle from the code is stated as a QUESTION with a
recommendation in section 7, and the wave plan is buildable around the
recommended answer.

Every quantity names the command that produced it. No file under `src/` was
edited. Nothing renders under vitest here, so every claim about what paints is
a reading claim (`docs/loop/this-repo.md` section 6).

---

## 0. Disposition of round 1

| Round-1 requirement | Disposition |
|---|---|
| S1: `createAnnouncementFromMarkdown` has six parameters; the walkthrough call passes four; `delayedPostAt` and `image` are the two dropped | **KEPT.** Re-verified verbatim, section 1. |
| S2: two production call sites of `createAnnouncementFromMarkdown`; the sibling `prompt-announcement-post.ts:27` passes five | **KEPT.** Re-verified with canary, section 2. |
| S2: `SCHEDULING_TIME_ZONES` is a name collision belonging to call-booking, not a precedent | **KEPT.** Re-verified, section 2. |
| S3: the render path splits across `WalkthroughAnnouncementPanel.tsx`, `AnnouncementDraftSlot.tsx` and `useAnnouncementDraftSlots.ts`, and the slot file is in the write set | **KEPT**, and it is the strongest thing round 1 did. |
| S3: the consequence copy at `AnnouncementDraftSlot.tsx:221-229` becomes false under scheduling and must be in scope | **KEPT and PROMOTED.** It is now requirement REQ-A32-1, section 5, with a construction and an instrument rather than a prop suggestion. |
| S5: "**replicate the sibling's client-side guard exactly**" including its `willSchedule` label derivation (`announcements-panel.tsx:296,507-513`) | **WITHDRAWN.** The sibling derives the label from string length and the post decision from `when.getTime() > Date.now()`. Copying that onto an arm-then-confirm consequence sentence makes the app state the opposite of what it is about to do. Replaced by REQ-A32-1. Enforcer it protected: none. |
| S3: "this file's header comment (`:6-15`) already records IT as having spent its one available JSX extraction" | **WITHDRAWN.** The header records that about `ModuleDeckCapturePanel.tsx` (843 lines by `@(Get-Content).Count`), not about the walkthrough panel. Section 3. |
| S3: "an extraction is required in this chunk **regardless of which branch**" | **REDUCED.** Established by arithmetic for Branches A and B; NOT established for Branch C. Restated honestly in section 3. |
| S6: the persistence question, left open for Wave 0 | **DECIDED: Branch A, do not persist.** Section 6. The check ruled it and this pass adopts the ruling, with one correction to its supporting measurement. |
| S6: `walkthrough-announcement.structure.test.ts:117-122` is "an **exact-set** assertion, not a floor" | **WITHDRAWN.** It is `expect(distinctKeys.size).toBe(5)` at `:123` - a COUNT. The five key names live only in the `it()` description. Section 6. |
| S3: "`grep -n "visibleAt"` returns **five** lines (`:82,241,242,296,469,480`)" | **WITHDRAWN.** `grep -c "visibleAt"` returns **6**; canary returns 0, exit 1. The six line numbers round 1 listed were right; the word "five" was wrong. Section 6. |
| S3: "none of them `localStorage`" as the basis for "the sibling does not persist" | **KEPT, RESTATED.** The claim about `visibleAt` is correct. But the FILE does use `localStorage`, at `announcements-panel.tsx:56` and `:176`, for `COURSE_URL_KEY`. Section 6 states it the narrow way, because the check's own reason 3 ("zero `localStorage`") reads as a claim about the file and is false about the file. |
| S4: `image` is DEFERRED with an owner, instrument and step | **KEPT** as residual 1. |
| S5: the timezone conversion must happen client-side via `new Date(value).toISOString()`; the assumption is unverifiable here | **KEPT** as residual 2 and as REQ-A32-2. |
| S5: a malformed date surfaces through the existing wrapper at `WalkthroughAnnouncementPanel.tsx:650` with no new copy needed | **KEPT.** Re-verified. |
| S8: Wave 1's write set includes `walkthrough-announcement.test.ts` because `:566-571` asserts exactly four arguments | **KEPT.** Re-verified at `:565-571`, section 8. |
| S8: no wave names a gate command | **WITHDRAWN.** Every wave now names one, each run this pass with its exit code read from a file. Section 8. |
| S8: Wave 0 is told to produce "a concrete extraction plan" with no constraint and no number | **WITHDRAWN.** Replaced by two named constraints and a number, section 8. |
| S3's Branch C: "new reducer action ... mirroring the existing `edit` action at `:240`" | **WITHDRAWN as the nearest precedent.** The nearest precedent is `choose-timing` (`useAnnouncementDraftSlots.ts:238`, action type at `announcement-draft-slots.ts:364`, reducer case at `:408`), which is a per-slot CHOICE control, not a text edit. Section 3. |

New in this round: REQ-A32-1 (the single-predicate requirement and its
instrument), REQ-A32-2 (the conversion), REQ-A32-3 (the extraction
constraint), the per-slot naming collision in section 3, and the correction to
the check's "no test reads `AnnouncementDraftSlot.tsx`" in section 5.

---

## 1. The gap, re-measured

`src/lib/canvas/announcements.ts:420-427`:

```
export async function createAnnouncementFromMarkdown(
  courseUrl: string,
  title: string,
  markdownBody: string,
  code?: string,
  delayedPostAt?: string | null,
  image?: AnnouncementBodyImage
): Promise<CanvasAnnouncement>
```

`delayedPostAt` is consumed at `:436-442`: re-parsed with `new Date(...)`, a
`NaN` throws "Could not read the scheduled visibility time.", and a valid date
goes to Canvas as `delayed_post_at` via `.toISOString()` at `:441`.

`src/app/actions/walkthrough-announcement.ts:603`:

```
const announcement = await createAnnouncementFromMarkdown(courseUrl, title, markdownBody, acronym);
```

Four positional arguments. **A32 is one omitted argument at one line.**

---

## 2. Caller census, corrected

Round 1 censused `createAnnouncementFromMarkdown` correctly and then, in
section 7, counted "three Canvas-announcement-posting surfaces, two already
scheduling" without measuring it. Both greps re-run this pass, neither piped
through `head`:

```
grep -rn "createAnnouncementFromMarkdown" src --include=*.ts --include=*.tsx | grep -v "\.test\."
grep -rn "createAnnouncementFromMarkdownXYZNOPE" src --include=*.ts --include=*.tsx   -> exit 1 (canary)
grep -rn "createAnnouncementAction" src --include=*.ts --include=*.tsx | grep -v "\.test\."
grep -rn "createAnnouncementActionXYZNOPE" src --include=*.ts --include=*.tsx         -> exit 1 (canary)
```

**Seven production call sites across the two posting entry points**, each
opened to see whether it forwards a schedule value:

| Call site | Entry point | Forwards a schedule value? |
|---|---|---|
| `src/app/components/canvas-tab/announcements-panel.tsx:259` | `postPromptAnnouncementAction` -> `createAnnouncementFromMarkdown` | **yes** (`delayedPostAt`) |
| `src/app/components/canvas-tab/announcements-panel.tsx:266` | `createAnnouncementAction` | **yes** (`delayedPostAt`) |
| `src/lib/workflows/registry/steps.announcements.ts:532` | `createAnnouncementAction` | **yes** (`postAt`) |
| `src/app/components/recording/useTakeAnnouncement.ts:762` | `createAnnouncementAction` | no - passes `undefined` explicitly, to reach the 6th `image` argument |
| `src/app/actions/lms-generation-writers.ts:64` | `createAnnouncementAction` | no - four args |
| `src/app/actions/messaging.ts:293` | `createAnnouncementAction` | no - four args |
| `src/app/actions/walkthrough-announcement.ts:603` | `createAnnouncementFromMarkdown` | **no - this row** |

(`prompt-announcement-post.ts:27` is the action body behind the first row, not
an eighth site. `canvas-inbox.ts:284` is the declaration.)

**The finding round 1 missed, and it is the one that matters for section 7:**
`steps.announcements.ts:532` is a workflow step. It declares `postAt` as a
step input (`:506`), branches its own progress copy on it (`:531`) and its own
summary label on it (`:538`). **A scheduled Canvas announcement already fires
from an UNATTENDED path in this app.** Round 1's section 7 argued the
INTEGRATION shape here ("this app fires INTO Canvas once, and Canvas executes
unattended afterward") is one `leverage.md`'s taxonomy does not describe
exactly. That shape already ships, one directory over.

**The name collision, re-verified and still correctly excluded.**
`src/app/components/canvas-tab/utils.ts:26-36` defines `SCHEDULING_TIME_ZONES`;
`grep -rn "SCHEDULING_TIME_ZONES" src --include=*.ts --include=*.tsx` shows its
only consumer is `inbox-panel.tsx:620`, inside a "Schedule a call with a
student" booking modal. Unrelated to `delayed_post_at`. Not a precedent.

**A reuse finding round 1 did not make.** `toDatetimeLocalValue` is EXPORTED
(`src/app/components/canvas-tab/utils.ts:46`) and `utils.ts` has **zero
imports** (`grep -c "^import" src/app/components/canvas-tab/utils.ts` returns
0) - a pure leaf with no server-only dependency. It has exactly one consumer
today (`announcements-panel.tsx:48,473`). The walkthrough surface should
import it, not copy it.

**And a trap that copying would spring.** `utils.ts:1` declares
`COURSE_URL_KEY = "ta-canvas-course-url"`. The walkthrough directory's key
canary (section 6) matches `/(?<![a-zA-Z])ta-[a-z-]*[a-z]/g` over RAW source
including comments, so copying that file, or even writing a comment in the
walkthrough directory that mentions any `ta-` literal, turns the canary red.
Import; do not copy, and do not name a `ta-` key in a comment there.

---

## 3. The surface, the branches, and what the extraction claim really rests on

### The render path

`WalkthroughAnnouncementPanel.tsx` imports and calls
`postWalkthroughAnnouncementAction` (`:65,647`), but the per-draft Post button,
its arm/confirm state and its copy render in `AnnouncementDraftSlot.tsx`, which
the panel maps its `slots` array into at `:899-912`. The panel supplies
`postDraft` (`:644-657`, deps `[selectedCourse]` at `:656`) with a fixed
two-argument shape declared at `useAnnouncementDraftSlots.ts:148-151` and
invoked at `:332`.

### Line budget, both counters

```powershell
$g="src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx"
@(Get-Content $g).Count                        # 985   <- the mandated instrument
(Get-Content $g | Measure-Object -Line).Lines  # 918   <- 67 lower, wrong
```

`wc -l` also gives **985**. The gap is 67 on this file, not the 42
`this-repo.md` cites for a different file. `LIMIT = 1000` at
`src/file-size-ceiling.structure.test.ts:41`; `grep -n
"WalkthroughAnnouncementPanel" src/file-size-ceiling.structure.test.ts` exits
**1** with canary `grep -c "ALLOWED_OVERAGE"` returning **2**, so no ratchet
entry; `COVERED_BY_RECORDING_SPLIT_CHECK` (`:51-54`) does not name it.
**15 lines of headroom, strictly enforced.**

### What round 1's extraction argument actually cited

Round 1: "this file's header comment (`:6-15`) already records **it** as having
spent its 'one available JSX extraction' once before." Opened
`WalkthroughAnnouncementPanel.tsx:1-20`. Lines 6-9 read, in substance: a
SIBLING to `ModuleDeckCapturePanel.tsx`, "see that document's WHERE IT LIVES
section for the measured reason (that panel was already within ~150 lines of
this repo's 1000-line ceiling, with its one available JSX extraction already
spent)."

**That is about `ModuleDeckCapturePanel.tsx`**, which measures **843** by
`@(Get-Content).Count` today. The header says nothing about the walkthrough
panel's own extraction budget. So the "regardless of branch" conclusion must
stand on arithmetic alone, and it does not stand for all three:

| Branch | Panel lines added (estimate) | 985 + estimate | Over 1000? |
|---|---|---|---|
| A. one panel-level field, unpersisted | ~48-58 (1 state line + the 28-line control block measured at `announcements-panel.tsx:462-489` + ~10-15 lines of conversion inside `postDraft` + threading a prop into `slots.map`) | 1033-1043 | **yes** |
| B. A, persisted under a new `ta-` key | A + 11 | 1044-1054 | **yes** |
| C. per-slot field | ~5-10 (thin wiring only; the control renders in `AnnouncementDraftSlot.tsx`) | 990-995 | **no** |

**Honest restatement: an extraction is REQUIRED by arithmetic for Branches A
and B, and is NOT required by arithmetic for Branch C.** For C it is required
only under a margin policy, which is a choice, not a measurement. Section 8
states the policy and its number explicitly so the architect can move it.

The one calibration figure this repo has for such estimates: A16 wave 2
budgeted 46 lines and landed 72 (`git show cbe84e2^:.../GradingRecordingPanel.tsx | wc -l`
-> 918; `git show cbe84e2:... | wc -l` -> 990), a **1.57x overrun**. Applied to
Branch C's worst case that is 16 lines, giving 1001 - which is over the wall
by one. **So Branch C's margin is not real either once the only measured
overrun factor in this repo is applied.** An extraction is warranted under
every branch; what changed is that the justification is now arithmetic plus a
named calibration factor, not a misattributed sentence.

### The per-slot branch has a precedent round 1 did not find, and a hazard nobody found

`AnnouncementDraftSlot.tsx` **already renders a per-slot control called
"Timing"** - `label="Timing"` at `:117`, `value={slot.timing}` at `:119`,
`onChange` dispatching `onChooseTiming` at `:120`, options at `:33-36`:
`{value: "beginning-of-week", label: "Beginning of week"}` and
`{value: "midweek", label: "Midweek check-in"}`. `AnnouncementTiming` is
declared at `src/lib/walkthrough-announcement-prompt.ts:64`. It is a CONTENT
framing choice that shapes the drafted text; it has nothing to do with Canvas
visibility.

Two consequences:

1. **Branch C has a ready template.** The action type is at
   `announcement-draft-slots.ts:364`, the reducer case at `:408`, the hook
   callback at `useAnnouncementDraftSlots.ts:238`, the staleness mirror at
   `AnnouncementDraftSlot.tsx:89-90`, and a structure test already pins the
   control to the rendered row (`walkthrough-announcement.structure.test.ts:745-763`,
   the anchored-slice idiom on `label="Timing"`). Round 1 named `edit` (`:240`)
   as the precedent; `choose-timing` is the closer one by a wide margin.
2. **Branch C puts a second "when" control in the same row as a select
   literally labelled "Timing".** That is a copy hazard the UX seat must
   resolve, not a blocker - but the new control must NOT be called "Timing",
   "Schedule" or anything an instructor could confuse with the drafting
   choice. The sibling's own label is the safe one to reuse: "Visible to
   students (optional)" (`announcements-panel.tsx:463`).

There is also a product argument for per-slot that round 1 did not make: this
panel exists to draft SEVERAL announcements with different content timings
("Beginning of week", "Midweek check-in"). A single panel-level visibility
field applied to whichever slot is posted next is semantically wrong on a
surface designed to produce announcements meant for different moments. That is
the substance of section 7's question.

---

## 4. The image parameter: DEFERRED, unchanged from round 1

`AnnouncementBodyImage` (`announcements.ts:283-286`) is never constructed by
either `createAnnouncementFromMarkdown` caller. It is NOT dead app-wide:
`createAnnouncementAction` (`canvas-inbox.ts:284-307`) resolves an image via
`resolveAnnouncementImage` (`announcement-image-upload.ts:138`), and
`useTakeAnnouncement.ts:762` is the one caller that builds and passes one -
confirmed this pass: it passes `undefined` in the 5th position specifically to
reach `image` in the 6th.

Attaching an image on a markdown-drafting surface is a separate capability with
its own UX questions (where would the image come from on the walkthrough
surface - a captured frame, an upload, neither exists there today). The row's
title asks about scheduling. Recorded as residual 1.

---

## 5. REQ-A32-1: one predicate, or the app lies at the moment it matters

**This is the blocker, and the fix is a construction, not a stronger
assertion.**

### The mechanism

The sibling derives its BUTTON LABEL and its POST DECISION from two different
predicates:

- `announcements-panel.tsx:296` - `const willSchedule = visibleAt.trim().length > 0;`
- `announcements-panel.tsx:247` - `if (when.getTime() > Date.now()) { delayedPostAt = when.toISOString(); ... }`

So the sibling already reads "Schedule announcement" (`:507-513`) on a button
that posts immediately, whenever the chosen time is in the past. On the sibling
this is cosmetic and is partly redeemed afterwards by the success copy at
`:280-282`, which branches on `scheduledLabel` and is therefore honest.

**On the walkthrough surface it is not cosmetic.**
`AnnouncementDraftSlot.tsx:221-229` is an arm-then-confirm CONSEQUENCE
statement - a paragraph with `id={...wta-post-consequence-${slot.id}}` at
`:223`, wired to the confirm button by `consequenceId` at `:249`. Its whole
job is to tell the instructor what pressing Confirm will do, and it currently
says the post is immediate and that "this app cannot recall or delete it
afterward" (`:224-226`). Give that paragraph a scheduled variant derived the
sibling's way and the sequence is:

1. The instructor types or pastes a time that is in the past - a mistyped year,
   a value that went stale while the panel sat open, or a wall-clock value that
   is already past in the browser's own timezone. The `min` attribute
   (`announcements-panel.tsx:473`) blocks PICKING a past time in the native
   widget; it does not block typing or pasting one.
2. The consequence line says the post is scheduled.
3. Confirm publishes it to every student in the course immediately and
   irrevocably.

That is the app stating the opposite of what it is about to do, in the one
control designed to prevent exactly that.

### The requirement

**REQ-A32-1. The consequence copy, the button labels and the post decision
must all read the SAME resolved value. The resolution happens once, in a pure
exported function in a plain `.ts` leaf, and returns a discriminated result.**

Shape, illustrative:

```
// src/app/components/walkthrough-announcement/scheduled-visibility.ts
export type ScheduledVisibility =
  | { kind: "immediate" }
  | { kind: "scheduled"; iso: string; label: string }
  | { kind: "invalid" };

export function resolveScheduledVisibility(raw: string, now: number): ScheduledVisibility;
```

- Empty or whitespace `raw` -> `immediate`.
- `Number.isNaN(new Date(raw).getTime())` -> `invalid`.
- `when.getTime() > now` -> `scheduled`, with `iso = when.toISOString()`
  (REQ-A32-2) and `label = when.toLocaleString()`.
- Otherwise (a valid but non-future time) -> `immediate`. **This preserves the
  sibling's actual BEHAVIOUR** - a past time posts now, it is not an error -
  while making it impossible for the copy to disagree with it, because the copy
  reads the same `kind`.

**Why a construction rather than an assertion:** `iteration-caps.md` records
that what ends a defect chain is "replacing an assertion with a construction
that makes the bad state unrepresentable", and that strengthening the same
mechanism never ends one. A boolean prop threaded from a length check is the
assertion version and can drift again the first time someone edits either side.
A single discriminated result cannot drift, because there is nothing to drift
from.

**It is also the only version this repo can test.** Vitest here is node-env and
renders no component, so logic inline in a `.tsx` cannot be tested at all. A
pure leaf can be, and must be: a table over empty / whitespace / malformed /
past / now / future, with `now` injected rather than read from the clock.

### How a future divergence gets caught - and a correction to the check

The check stated: "no test reads `AnnouncementDraftSlot.tsx` at all
(`grep -rn "AnnouncementDraftSlot" src --include=*.test.ts` returns only
`walkthrough-announcement.structure.test.ts:163,175,176`)."

**Measured, that is false.** The same grep, re-run this pass, returns **29**
lines across **3** files. `walkthrough-announcement.structure.test.ts` reads
`AnnouncementDraftSlot.tsx`'s OWN source in five separate describe blocks -
`fs.readFileSync(path.join(WALKTHROUGH_ANNOUNCEMENT_DIR, "AnnouncementDraftSlot.tsx"), ...)`
at `:226`, `:256`, `:356`, `:746` and `:789` - and several of those assert on
its COPY and its ARIA (`:264-271` on the research notice's own text, `:367` on
`role="status" aria-live="polite"`, `:375` on the Retry gate).

**This makes the blocker cheaper to close, not less real.** The blocker stands:
no existing assertion ties the consequence copy to the post decision, and
nothing would catch the split-predicate version. But the instrument to add is
an in-repo idiom already running five times in the file the wave is already
touching. The pass condition:

> **Object:** the anchored slice of `AnnouncementDraftSlot.tsx` bounded by the
> consequence paragraph's own `id={` ... `wta-post-consequence` anchor and its
> closing `</p>`.
> **Instrument:** `fs.readFileSync` plus paired `String.indexOf` anchors in
> `walkthrough-announcement.structure.test.ts`, matching the idiom at
> `:745-763` and `:788-806`, with both anchors asserted to resolve before the
> slice is asserted on.
> **Direction of failure:** RED when the slice does not reference the resolved
> visibility value, RED when it references a separate length-derived boolean,
> and RED when either anchor fails to resolve.

A second assertion of the same shape pins the same value to the button labels
at `:239-244`.

### The third label round 1 missed

Round 1 named `idleLabel="Post to Canvas"` (`:239`) and
`loadingLabel="Posting..."` (`:244`). There is a third:
`confirmLabel="Confirm post"` at **`:240`** - the label the instructor reads
immediately before the irrevocable act. All three need a scheduled variant.

(Citation correction: the check placed `consequenceId` at `:247`. It is at
`:249`. `onConfirm` is at `:247`.)

### The copy is duplicated; scoping to the walkthrough alone is correct

```
grep -rn "Posting publishes this announcement" src --include=*.tsx --include=*.ts | grep -v "\.test\."
grep -rn "Posting publishes this announcementXYZ" src --include=*.tsx   -> exit 1 (canary)
```

Three production copies: `GeneratedPostSection.tsx:223`,
`TakeAnnouncementPanel.tsx:597`, `AnnouncementDraftSlot.tsx:224`. **Only the
third is in scope**, because the other two reach
`createAnnouncementAction` without a delay (`useTakeAnnouncement.ts:762`
passes `undefined` in the 5th position). Said explicitly here because a later
reader grepping the sentence finds three and cannot otherwise tell which one
A32 touched.

---

## 6. Timezone, validation, and persistence

### REQ-A32-2: the conversion

`delayed_post_at` goes to Canvas as an ISO 8601 UTC string
(`announcements.ts:441`, `params.append("delayed_post_at", when.toISOString())`;
identically in the plain-text sibling at `:351`). A `datetime-local` input's
value is a local wall-clock string with no offset -
`src/app/components/canvas-tab/utils.ts:17-18`'s own comment says so. `new
Date(thatString)` is interpreted in the browser's local timezone, and
`.toISOString()` is where the conversion to UTC happens, client-side, before
the server action is called (`announcements-panel.tsx:248`).

**REQ-A32-2: the same conversion, in `resolveScheduledVisibility`, and nowhere
else.** There is no timezone-override control on this path anywhere in the
codebase (the only one that exists belongs to the unrelated call-booking
feature, section 2). The assumption that the instructor's browser timezone is
the one they mean is inherited from the sibling and is unverifiable here -
residual 2.

### Validation

A malformed string throws "Could not read the scheduled visibility time."
(`announcements.ts:438-440`), propagates through
`walkthrough-announcement.ts:605-607`'s catch, and reaches the instructor
through the existing wrapper at `WalkthroughAnnouncementPanel.tsx:650` as:
"Canvas refused the announcement - Could not read the scheduled visibility
time. Nothing was posted." No new error copy is needed for the server path.

Client-side, `resolveScheduledVisibility` returns `invalid` and the confirm is
refused before the action is called, matching the sibling's own early return at
`announcements-panel.tsx:243-246`.

### Persistence: DECIDED - Branch A, do not persist

Round 1 left this open. The check ruled it. **This pass adopts the ruling.**

The directory's canary, opened directly
(`walkthrough-announcement.structure.test.ts`, describe at `:103`):

```
it("finds exactly five distinct ta- keys across every non-test file in this directory today
    (ta-rec-wta-course, ta-rec-wta-module, ta-rec-wta-notes, ta-rec-wta-emoji, ta-rec-wta-resources)", () => {
  expect(distinctKeys.size).toBe(5);     // :123
});
```

**This is a COUNT assertion, not an exact set.** The five names appear only in
the `it()` description and are asserted nowhere, so a renamed key passes and
only a changed COUNT fails. Round 1 called it "an exact-set assertion, not a
floor"; that changes Branch B's instruction materially - bumping 5 to 6 at
`:123` is an enforced gate, and re-enumerating the names in the description is
documentation the suite cannot check. The keys regex at `:111` scans RAW source
including comments.

Three reasons for Branch A, in order of weight:

1. **A persisted wall-clock instant is stale by construction.** Restore it on
   tomorrow's reload and the field holds a past time. Under
   `resolveScheduledVisibility` that resolves to `immediate` and the copy says
   so - so REQ-A32-1 removes the danger, but the control still silently
   discards what the instructor thought they had set. A persisted stale
   timestamp is the worst input this surface can receive and there is no reason
   to build a way to receive it.
2. **The repo's persist rule and this value are different classes.** The five
   keys this directory persists (`WalkthroughAnnouncementPanel.tsx:97-102`) are
   standing values an instructor reuses across sessions. A one-shot publication
   instant is not. The rule exists to spare retyping.
3. **The sibling already decided it, and the instrument does not move.**
   Measured: `grep -c "visibleAt" src/app/components/canvas-tab/announcements-panel.tsx`
   returns **6** (canary `grep -c "visibleAtXYZNOPE"` returns 0, exit 1), at
   `:82,241,242,296,469,480`, none of them a storage call. **Stated narrowly on
   purpose:** that file DOES use `localStorage`, at `:56` and `:176`, for
   `COURSE_URL_KEY` - so "zero `localStorage`" is false about the file and true
   only about `visibleAt`. Branch A keeps `distinctKeys.size` at 5 and touches
   no canary.

**This decision is orthogonal to the section 7 question.** It rules out Branch
B. It applies equally to a panel-level field and a per-slot field: neither is
persisted.

---

## 7. THE QUESTION FOR THE OWNER

Two rounds have not settled one thing, and it is a product call. Per
`AGENTS.md` "Two rounds, then ask" it goes to the owner rather than into a
third round; the wave plan in section 8 is written against the recommendation.

> **This panel drafts several announcements at once, each with its own content
> timing ("Beginning of week", "Midweek check-in"). Should each draft get its
> own "visible to students from" time, or should there be one time for the
> panel, applied to whichever draft is posted next?**

| | Per-slot (Branch C, recommended) | One panel-level field (Branch A) |
|---|---|---|
| Panel lines added | ~5-10 | ~48-58 |
| Extraction needed before the feature | yes, under the calibrated estimate (section 3) | yes, by plain arithmetic |
| Files changed | `useAnnouncementDraftSlots.ts`, `announcement-draft-slots.ts`, `AnnouncementDraftSlot.tsx`, thin panel wiring | `WalkthroughAnnouncementPanel.tsx` (state + control + conversion), `AnnouncementDraftSlot.tsx` (copy + labels) |
| Precedent to copy | `choose-timing`, already per-slot in these same files | `announcements-panel.tsx:462-489`, a different directory and a single-draft form |
| Copy hazard | a second "when" control beside the existing "Timing" select - must not be named "Timing" or "Schedule" | one control, no collision |
| Matches what the surface is for | yes - several announcements meant for several moments | no - one time for N drafts posted at different moments |

**Recommendation: per-slot.** It is the cheaper branch on the panel that has
15 lines of headroom, it has a precedent in the same three files, and it is the
only one that is coherent with a surface whose whole purpose is producing
several announcements for several moments. Round 1 declined to recommend;
the cost table now has measured numbers on both sides.

**What it costs to be wrong.** If the owner wants one panel-level field, the
extraction target grows from "the calibrated 16 lines" to "at least 58 lines",
which is a materially larger wave 0 and may need two extractions. Nothing built
for per-slot is wasted: `resolveScheduledVisibility`, the copy rewrite, the
three label variants and the action-layer change (wave 1) are identical under
both; only where the raw string is stored differs.

---

## 8. Wave plan and write sets

Round 1 named no gate command in any wave. Every gate below was RUN this pass
and its exit code read from a file, not a pipe. Multi-path runs use
`npm run test:paths --`; raw `npx vitest run <paths>` silently drops unmatched
arguments and exits 0 (`this-repo.md` section 1), so it is never used.

**Wave 0 - design, no files written.**

- Resolve the section 7 question if the owner has answered; otherwise proceed
  on the recommendation.
- **REQ-A32-3, the extraction constraint round 1 did not have.**
  `walkthrough-announcement.structure.test.ts`'s describe "G2" at `:169` reads
  `WalkthroughAnnouncementPanel.tsx`'s OWN source and asserts:
  - `:175-177` - `expect(panelSource).toMatch(/<AnnouncementDraftSlot\b/)`
  - `:179-181` - `expect(panelSource).toMatch(/useAnnouncementDraftSlots\(/)`

  The obvious JSX extraction candidate is the `slots.map` block at `:899-912`,
  which CONTAINS `<AnnouncementDraftSlot` and is therefore exactly what `:176`
  forbids moving. The block's own header at `:159-167` records why it exists:
  an earlier wave shipped 2,711 lines of fully-tested leaves that nothing
  called. **So: the `slots.map` call and the `useAnnouncementDraftSlots(...)`
  call stay in the panel. Extract something else.**
- **The number.** Wave 0's exit criterion is
  `@(Get-Content src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx).Count`.
  Under the recommended per-slot branch the target is **940 or lower**: 1000
  minus the branch's calibrated worst case (10 x 1.57 = 16, section 3) leaves
  984, and 940 leaves a further 44 lines for the next feature to use. The 44 is
  a POLICY choice, not a measurement, and the architect may move it - but wave
  0 must exit on a number, not on "comfortably under". Under Branch A the same
  policy gives **865 or lower** (1000 - 58 x 1.57 = 909, minus 44).
- Lint is load-bearing here and must be named, because `this-repo.md:85-100`
  records the React Compiler `preserve-manual-memoization` rule failing on an
  untouched callback after a hook extraction from a sibling panel - a
  LINT-ONLY failure that leaves tsc and the whole suite green.

**Wave 1 - action layer.**

- Write set: `src/app/actions/walkthrough-announcement.ts` (a 5th
  `delayedPostAt` parameter on `postWalkthroughAnnouncementAction`, `:595-608`,
  forwarded to `createAnnouncementFromMarkdown` at `:603`) and
  `src/app/actions/walkthrough-announcement.test.ts`.
- The test file is NOT optional in this wave. `:565-571` is
  `expect(createAnnouncementFromMarkdown).toHaveBeenCalledWith(...)` with
  exactly four arguments; `toHaveBeenCalledWith` checks the full list, so
  adding a fifth - even `undefined` - fails it. New tests owed: the argument
  forwarded verbatim, and the library's `NaN` message not swallowed or
  reworded by the action.
- No change to `src/lib/canvas/announcements.ts`.
- **Wave 1 is not independently shippable and is not meant to be.** A 5th
  parameter no caller supplies is inert. It lands with wave 2 in the same push.
- Gate:

```
npx tsc --noEmit
npm run test:paths -- src/app/actions/walkthrough-announcement.test.ts \
                      src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts \
                      src/app/components/walkthrough-announcement/useAnnouncementDraftSlots.test.ts \
                      src/app/components/walkthrough-announcement/announcement-draft-slots.test.ts
```

Run this pass: `COVERED` on all four (26 / 77 / 12 / 81 passing). Exit code
read from a file: **0**.

**Wave 2 - the leaf.**

- New file `src/app/components/walkthrough-announcement/scheduled-visibility.ts`
  (`resolveScheduledVisibility`, section 5) and its own test. Pure, no React,
  no DOM, `now` injected - the same discipline
  `announcement-draft-slots.ts:3` states for itself ("no DOM, no use server -
  this file is the pure leaf every reducer, hook and ... ").
- Import `toDatetimeLocalValue` from `src/app/components/canvas-tab/utils.ts`
  for the `min` attribute; do not copy it (section 2's trap).
- Write set: the new file and its test. Nothing else.
- Gate: `npx tsc --noEmit` and `npx vitest run <the one new test>` - a single
  path may use raw vitest, since there is nothing for it to silently drop.

**Wave 3 - the UI, per-slot (recommended branch).**

- Write set:
  `src/app/components/walkthrough-announcement/announcement-draft-slots.ts`
  (new slot field and a new action, mirroring `choose-timing` at `:364` and
  `:408`),
  `src/app/components/walkthrough-announcement/useAnnouncementDraftSlots.ts`
  (the callback, mirroring `:238`; `postDraft`'s type at `:148-151` and its
  call at `:332` gain the resolved value),
  `src/app/components/walkthrough-announcement/AnnouncementDraftSlot.tsx` (the
  control, the consequence copy at `:221-229`, and all THREE labels at
  `:239`, `:240`, `:244`),
  `src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx`
  (thin `postDraft` wiring at `:644-657`; its `useCallback` deps at `:656`,
  currently `[selectedCourse]`, gain whatever the new closure reads), and
  `src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts`
  (the two new anchored-slice assertions from section 5).
- **The calling file is in the list by construction**: the panel is the file
  that calls `postWalkthroughAnnouncementAction` at `:647`, so wave 1's
  parameter cannot ship dead.
- **No `ta-` key is added** (section 6), so `distinctKeys.size` stays 5 and the
  canary at `:123` does not move. If any wave DOES add one, `:123` must be
  bumped in the same commit and the names re-enumerated in the description.
- Gate: the same four-path `test:paths` line as wave 1, plus wave 2's new test,
  plus `npx tsc --noEmit`, `npm run lint`, and a final
  `@(Get-Content .../WalkthroughAnnouncementPanel.tsx).Count` reported as a
  number against 1000.

**Wave 4 - baseline and regression.**

- Baseline: check `docs/REGRESSION.md` with `grep -a` before writing. Not done
  in this pass; owned by the baseline seat.
- The test seat owes no removal test for a leverage claim, because section 9
  concludes there is no new claim to remove - which is a legitimate disposal
  under `leverage.md`, not a gap.

---

## 9. Leverage: inherited, and now understated

The capability exists end to end in
`createAnnouncementFromMarkdown:420-442`; the walkthrough action drops it at
exactly one line, `walkthrough-announcement.ts:603`; the sibling one file over
already passes it. **A32 adds zero new scheduling mechanism to this codebase.**

Round 1's conclusion was right and is now stronger than round 1 knew: of seven
production call sites (section 2), three already forward a schedule value, and
one of those three - `steps.announcements.ts:532` - does it from an UNATTENDED
workflow step. Round 1 argued the INTEGRATION shape here is one `leverage.md`'s
taxonomy does not describe exactly, on the grounds that the trigger direction
is reversed from that card's webhook example. That exact shape already ships.

**So the honest framing, which the criteria document must state plainly:** the
INTEGRATION-class advantage was earned by whichever change first added
`delayed_post_at` support and wired it into the other surfaces, not by A32.
This is the `AskAiModal.tsx` disposal `leverage.md` prescribes - "accept the
cost explicitly: state in the criteria that the advantage is inherited" - and
it is reached by counting rather than argued around.

What A32 legitimately adds is a new user-facing control on a surface that
lacked one, plus the copy that control makes false and REQ-A32-1 makes true
again. That is reachability work with a correctness requirement attached, and
saying so is not a reason to skip Acceptance criteria: a brand-new control
fires `seats.md`'s User experience trigger.

---

## 10. The silent-green failure this scope exists to prevent

The feature can be built, pass `npx tsc --noEmit`, `npm run lint`,
`npm run build`'s compile line, all 20,200 vitest tests and every structure
test, and ship with the arm-then-confirm consequence copy telling the
instructor their announcement is scheduled while Canvas publishes it to every
student immediately and irrevocably. Nothing renders under vitest; the
action-layer test at `:565-571` asserts argument forwarding and says nothing
about which predicate drove the copy. **The first observer would be a student.**
REQ-A32-1 and its two new anchored-slice assertions exist for exactly that
path, and they are the reason `walkthrough-announcement.structure.test.ts` is
in wave 3's write set.

---

## Residual register

Each entry names an object, an owner, an instrument, a direction of failure and
a step. An entry missing any of those is a deletion and is not listed here.

1. **The `image` parameter.** Object: `createAnnouncementFromMarkdown`'s 6th
   parameter (`announcements.ts:426`), unreached from both its production
   callers. Owner: **the repo owner** - whether a markdown-drafting surface
   should attach an image is a product decision, and no capture path or UI
   exists on either surface today. Instrument:
   `grep -rn "createAnnouncementFromMarkdown(" src --include=*.ts --include=*.tsx | grep -v "\.test\."`,
   confirming no call site passes a 6th argument; canary, the same grep with a
   nonsense name, exits 1. Direction of failure: stays a live gap until a row
   or scope document carries it; it becomes a deletion the moment it stops
   appearing in `docs/BACKLOG.md` with an owner and a step. Step: the owner's
   next pass over the walkthrough or prompt-announcement surfaces, or a fresh
   row if an image-capture UI is wanted there. Not blocking A32.

2. **The instructor-browser-timezone assumption.** Object: the Canvas-side
   reveal instant against the instructor's intended local time. Owner: the
   repo owner - it needs a real browser against a real Canvas course, and this
   environment has neither (`this-repo.md` section 6). Instrument: post a
   scheduled walkthrough announcement in a real session and compare the
   revealed time to the picked time. Direction of failure: FAIL if they differ
   by anything other than rounding to the minute. Step: the owner's manual
   verification pass after this ships.

3. **The per-slot / panel-level shape.** Object: where the scheduled-visibility
   value lives. Owner: **the repo owner** (section 7's question). Instrument:
   the owner's answer; the cost table in section 7 is the evidence, and there
   is no code measurement that decides it. Direction of failure: if
   unanswered, wave 3 builds per-slot on the recommendation, and a later
   panel-level answer costs a larger wave 0, not a rebuild. Step: asked now,
   alongside other running work; absorbed in wave 0.

4. **The "Timing" naming collision.** Object: the new control's label and hint
   text, sitting in the same row as the existing `label="Timing"` select
   (`AnnouncementDraftSlot.tsx:117`). Owner: the User experience seat in wave
   3, and ultimately the repo owner in a browser. Instrument: a source-text
   assertion in `walkthrough-announcement.structure.test.ts` that the new
   control's label string is not "Timing" and not "Schedule", using the same
   anchored-slice idiom; plus the owner's own reading of the rendered row.
   Direction of failure: two adjacent controls both meaning "when", one
   changing the drafted text and one changing Canvas visibility, is a
   mis-click the app cannot detect and cannot undo. Step: wave 3.

5. **Every UI and copy claim in this document is a reading claim.** Object: the
   confirm-arm copy, the three button labels, the control's layout and focus
   order. Owner: the repo owner, in a real browser. Instrument: manual check
   against the deployed app - no component renders under vitest
   (`vitest.config.ts` is node-env with `include: ["src/**/*.test.ts"]`).
   Direction of failure: a source reading can be right about what the code says
   and wrong about what paints, focuses or announces. Step: the owner's
   verification pass after this ships.

---

## What this pass could not determine

- Whether Canvas honours `delayed_post_at` as the existing callers assume, and
  what it does with a past one. No live Canvas, no API key.
- Click counts, focus order and keyboard behaviour for either branch. Nothing
  renders under vitest here.
- Which branch the owner wants (section 7), and therefore the exact wave-0
  target. Both targets are stated so either answer is buildable.
- Whether the architect's chosen wave-0 extraction trips the React Compiler
  lint rule. `this-repo.md:85-100` records it happening on a sibling panel;
  only `npm run lint` after the move can say.

---

## Verification

```
npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
```

Output tail:

```
 Test Files  2 passed (2)
      Tests  21 passed (21)
COVERED src/lib/no-emojis.test.ts files=1 passed=18
COVERED src/source-bytes.structure.test.ts files=1 passed=3
```

Exit code, written to a file and then read from that file rather than from a
pipe (`... > <out> 2>&1; echo $? > <exit-file>; cat <exit-file>`): **0**.

Both documents were also byte-scanned directly for non-ASCII content before
that run (a Python read of the raw bytes, counting every byte above 127):
**0 non-ASCII bytes in each**. Three U+2713 characters in a sibling document
turned the emoji gate red for every concurrent agent earlier today, which is
why this is measured rather than assumed.

`git status --short`, run immediately after the gate above and after both
files were written:

```
 M docs/BACKLOG.md
 M docs/a24-scope.md
 M docs/a32-scope.md
 M docs/backlog.yml
 M docs/css-orphans.md
 M src/tools/backlog/yaml-codec.test.ts
 M src/tools/backlog/yaml-codec.ts
```

This pass's write set is exactly `docs/a24-scope.md` and `docs/a32-scope.md`.
The other five entries belong to concurrent agents working other rows; none
was opened for writing here, and no file under `src/` was modified to produce
any measurement in this document.
