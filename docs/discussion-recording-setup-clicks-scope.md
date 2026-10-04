# Discussion replies: fewer clicks to set up a recording - recon and scope

Status: SCOPE, authored by a `loop-seat` (Sonnet) on 2026-10-04. Not yet checked.
Owner request (verbatim): "the recording from discussions and replying page needs
to be far fewer clicks to set up." No production code was written; this file is
the only artifact.

Evidence tags used below:

- `[MEASURED <cmd>]` a command was run in this checkout and its output is quoted.
- `[READ file:line]` I opened that file at that line. Nothing in this repo renders
  a component, so every UI behaviour claim is a READ claim, not an observation.
- `[ARITHMETIC]` computed from READ facts; the runtime was not observed.
- `[UNDETERMINED]` I could not establish it here and say so.

What I could not do, stated once (`docs/loop/this-repo.md` section 6): run the app,
open the browser's screen-share picker, observe a reload, or feel a click count.
Nothing in section 2's counts below was observed in a browser.

---

## 0. The headline, and why this scope is smaller than the request sounds

THE PAGE-LOCAL SETUP IS ALREADY AT ITS FLOOR FOR A RETURNING INSTRUCTOR. Every
setup control on the Discussion replies sub-tab persists under a `ta-rec-disc-*`
key and defaults to a usable value, and nothing between arrival and "Start
capture" is required. From the page being visible, a repeat session costs ONE
in-app click (Start capture) before the browser's own picker takes over.

So "far fewer clicks to set up" cannot be satisfied by removing clicks inside the
page on the repeat path - there are none to remove. The clicks that exist, and
that this scope can cut, are:

1. ARRIVAL. Reaching the page from the floating action button costs 3 clicks and
   also overwrites the instructor's remembered sub-tab (section 2.3).
2. FIRST-VISIT COURSE. Choosing a course costs 2 clicks, once, on each of the
   seven recording surfaces that keep their own course key (section 2.4).
3. THE BROWSER PICKER. Up to 3 clicks per session, owned by the browser, not by
   this app, and not measurable here (section 2.5).

I also record one hypothesis I CANNOT rule out from the tree and that would
explain the owner's feeling better than any of the above: that the persisted
values do not visibly restore after a reload, so the instructor re-does setup
every session (section 6, H1). It is a thirty-second owner check. W-B (fab
arrival) does NOT depend on its answer and may proceed; W-A (course seed) IS
gated on it - if H1 fails, the right item is a mount-effect persistence restore
on the ta-rec-disc-* controls (the LectureScriptPanel idiom), not W-A, which
never fires for a returning instructor whose key is already written.

Triage (seats, per `docs/loop/seats.md` triage table): acceptance criteria
(always); architect + reuse (a new module plus more than two files in the fab
wave); UX (user-visible); data/storage (a seeded value is read from other
surfaces' `ta-rec-*` keys, and a new read path is a persisted-shape question);
security, reliability, visual, operability, external-facts: triaged OUT for
the course-seed and fab waves except external-facts for section 2.5 (the
picker), which no wave builds against. Accessibility runs on the hint line
(W-A) only. This is a feature-adjacent change, so DEV_LOOP's leverage rule
applies: the claim is CLICK COST, named explicitly as click cost
(`docs/loop/leverage.md:66`), no more; its removal test is not buildable here
(`leverage.md:176-184`) and is recorded as an OWNER residual.

---

## 1. Where the surface is

The "Discussions and replying" page is the Recording tab's `discussions` inner
tab, labelled "Discussion replies" (`RecordingTab.tsx:596`, tab key `discussions`;
panel mounted at `RecordingTab.tsx:846-853`). Panel: `DiscussionRepliesPanel.tsx`
(default export, `:103`), settings block `DiscussionCaptureSettings.tsx`, hook
`useDiscussionReplies.ts`, persisted controls `discussion-persisted-controls.ts`,
capture `useDiscussionCapture.ts`.

Interpretation made, and acted on: "recording from discussions" = screen-capturing
a discussion board so the app reads posts off the screen and drafts replies. The
sibling tab "Message replies" (`RecordingTab.tsx:596`, `MessageRepliesPanel`) has
the same setup shape (`MessageCaptureSettings.tsx:107-122` course select, `:125`
save-video checkbox, `:333` Start capture) and the same sibling-course-key
problem; whether it is in scope is fork F1.

Sibling tabs I looked at and left out: "Record", "Record announcement",
"Module walkthrough deck", "Announcement from a walkthrough" (each has its own
course key; see section 2.4), and Grading's recording panel.

---

## 2. CURRENT FLOW, click by click

### 2.1 From the page being visible to the capture being armed

Arming = the click that calls `getDisplayMedia`: `handleStartStop`
(`DiscussionRepliesPanel.tsx:533-539`) -> `start()` -> `captureRef.current.start`
-> `navigator.mediaDevices.getDisplayMedia` (`useDiscussionCapture.ts:410-413`).
That call passes `video: { frameRate: { ideal: 5 } }, audio: false` and NO
`displaySurface` hint (`useDiscussionCapture.ts:410-413`).

| # | Control | file:line | Default | Persisted under | Required? | Clicks to change |
|---|---|---|---|---|---|---|
| 1 | Start capture button | `DiscussionRepliesPanel.tsx:703-711` | - | - | REQUIRED (the arming action) | 1 |
| 2 | Course select | `DiscussionCaptureSettings.tsx:118-133` | `""` = "No course selected" (`discussion-persisted-controls.ts:136-138`) | `ta-rec-disc-course` (`:137`, `:141`) | OPTIONAL - start works with no course; the hint says "drafting still works without one" (`DiscussionCaptureSettings.tsx:169`) | 2 (open, choose); disabled while courses load (`:125`) |
| 3 | Audience toggle | `DiscussionCaptureSettings.tsx:175` (native buttons, `ui/SegmentedToggle.tsx:131-141`) | "students" (`discussion-reply-prompt.ts:436-439`) | `ta-rec-disc-audience` (`:129`, `:133`) | OPTIONAL | 1 |
| 4 | Also save the screen recording | `DiscussionCaptureSettings.tsx:136` | off (`:145`) | `ta-rec-disc-save-video` | OPTIONAL | 1 |
| 5 | Download automatically | `DiscussionCaptureSettings.tsx:146` | off (`:154`), disabled until #4 (`:150`) | `ta-rec-disc-auto-download` | OPTIONAL | 1 |
| 6 | Each reply should include (multi-select) | `DiscussionReplyControls.tsx:94-127` | compliment + deeper-question (`discussion-reply-prompt.ts:362-367`) | `ta-rec-disc-ingredients` | OPTIONAL | open + toggle + dismiss = 3 per change `[ARITHMETIC]` (MUI multiple Select stays open after a pick; `[UNDETERMINED]` whether Escape is used instead of a click-away) |
| 7 | Open each reply with first name | `DiscussionReplyControls.tsx:140-143` | ON (`:364`) | `ta-rec-disc-address-name` | OPTIONAL | 1 |
| 8 | Answer the questions in each post | `DiscussionReplyControls.tsx:166-169` | ON (`:366`) | `ta-rec-disc-answer-questions` | OPTIONAL | 1 |
| 9 | Formality slider | `DiscussionReplyControls.tsx:193-207` | "balanced" (`:365`) | `ta-rec-disc-formality` | OPTIONAL | 1 (click a mark) |
| 10 | Knowledge pages: add | `DiscussionRepliesPanel.tsx:685` (`AddKnowledgePages`) | none carried | `ta-rec-disc-kb-context-label` (label only) | OPTIONAL | not counted: `[UNDETERMINED]`, file not opened for its click cost |
| 11 | Eligible resource kinds (multi-select) | `DiscussionResourceSettings.tsx:52-80` | all kinds (`discussion-persisted-controls.ts:88-110`) | `ta-rec-disc-resource-kinds` | OPTIONAL | 3 per change `[ARITHMETIC]` |
| 12 | Min / max video length | `DiscussionResourceSettings.tsx:89-112` | unset | `ta-rec-disc-video-min` / `-max` | OPTIONAL | 1 focus + typing, each |

All persistence is a `useState` initializer reading `readLocalStorage` and a
wrapped setter calling `writeLocalStorage`
(`discussion-persisted-controls.ts:127-206`). `[MEASURED]` the whole control
cluster is therefore already covered by the repo's persist-ui-control-state rule;
there is NO control on this page that fails it.

MEASURED click counts (in-app, from the Discussion replies panel being visible to
the click that opens the browser picker):

| Scenario | Clicks | Derivation |
|---|---|---|
| Repeat session, nothing changed | 1 | row 1 only |
| First ever visit, accept every default | 1 | row 1 only; nothing is required |
| First ever visit, pick a course | 3 | rows 2 (2) + 1 (1) |
| First ever visit, course + "fellow educators" + save video + auto-download | 6 | rows 2 (2) + 3 (1) + 4 (1) + 5 (1) + 1 (1) |
| Each later change of course | 2 | row 2 |

`[ARITHMETIC]` over `[READ]` rows above; no instrument produces a click count in
this repo. The existing UX record agrees on the repeat figure: it counts "Draft
30 replies and copy them into Canvas" as "2 + 30 per-row copies" - Start and Stop
- with no setup clicks (`docs/recording-controls-ux-acceptance-criteria.md:699`).

Required-for-safety versus incidental, by row:

- Required: row 1 only. There is no confirm and no mandatory selection ahead of
  arming; the confirms on this page all sit AFTER capture and guard overwrite or
  delete (Delete table: `DiscussionRepliesPanel.tsx:841-871`, signature `:416`;
  Redraft every reply: `DiscussionCaptureSettings.tsx:183-193`, signature
  `DiscussionRepliesPanel.tsx:442-454`; row Remove and Redraft-edited-row live in
  the row component). None is touched by any wave below.
- Incidental, and reducible: nothing on the repeat path. On first visit, row 2
  (the course) is the only control an instructor routinely has to touch.

### 2.2 After arming (external, listed so the count is not mistaken for the whole)

The browser opens its own screen-share picker. In Chromium-family browsers this
is a tab-type choice, a source choice and a Share confirm: up to 3 clicks.
`[UNDETERMINED]` - not observable here, browser-specific, and the app has no
control over the Share confirm (it is the browser's consent gate and must stay).
After the share is granted the instructor switches to the discussion board's
window by an OS or browser action outside this app.

### 2.3 Arrival: how an instructor gets to the page

| Route | Clicks to the panel | Then to arming | Cite |
|---|---|---|---|
| Reload or return; last location was this tab | 0 | 1 | `useAppNavigation.ts:94`, `:268-` (resolves `ta-active-tab`, `ta-manual-view`), `RecordingTab.tsx:62-76` (reads `ta-rec-view`) |
| Another Tools destination | Recording rail item (1) + Discussion replies tab (1 only if the last Recording view was not this one) = 1 to 2 | 2 to 3 | `manual-rail.ts:128` (Recording destination); `RecordingTab.tsx:596-616` |
| Another top-level tab | +1 for the top-level tab; label and position `[UNDETERMINED]` (tab strip not opened) | 3 to 4 | - |
| The floating action button | fab (1) + "Recording tools" (1) + Discussion replies tab (1) = 3 | 4 | `FabQuickActionsMenu.tsx:161-166` (entry), `AiChatFab.tsx:441-443` (`navigateToRecordingTool("record")`), `RecordingTab.tsx:108-109` (`setRecView(detail.view)`) |
| Knowledge base: select pages, "Start recording" | lands on `discussions` directly | 1 after the select | `KnowledgeTab.tsx:414-415` (`openRecordingTool({ view: "discussions", ...})`) |

THE FAB FINDING, because it is a reachability fact and not a taste one. The fab
used to have a separate Discussions entry; F4 merged three recording entries into
one "Recording tools" that always lands on `record` (`AiChatFab.tsx:430-443`,
`FabQuickActionsMenu.tsx:47-53`), reasoning that the Recording tab's own strip
makes every view reachable. That reasoning priced the nested-submenu alternative
and chose to add a click. For this flow it is measurable: the fab path to
capture armed is 4 in-app clicks, and `RecordingTab.tsx:108-109` writes the
landing view into `recView`, which the effect at `:78-80` persists to
`ta-rec-view` - so using the fab ALSO moves a "Discussion replies" instructor
off their remembered sub-tab.

### 2.4 The course key is per-surface, seven times

`grep -rnoh '"ta-[a-z0-9-]*course[a-z0-9-]*"' src --include=*.ts --include=*.tsx`
(then filtered by hand to recording surfaces) `[MEASURED]`: `ta-rec-disc-course`
(`discussion-persisted-controls.ts:137`), `ta-rec-msg-course`
(`useMessagePersistedControls.ts:29`), `ta-rec-ann-course`
(`RecordingTab.tsx:173`, `:530`; `useTakeAnnouncement.ts:300`), `ta-rec-grade-course`
(`GradingRecordingPanel.tsx:183`), `ta-rec-mod-course`
(`ModuleDeckCapturePanel.tsx:94`), `ta-rec-wta-course`
(`WalkthroughAnnouncementPanel.tsx:97`), `ta-rec-avatar-course`
(`useAvatarScript.ts:66`). Seven independent keys; no shared "current course".
`[UNDETERMINED]` whether every one holds a course_hub uuid (only
`ta-rec-disc-course`'s domain is confirmed: `useReplyRows.ts:46`, "a course_hub
uuid"). Any seed must therefore be validated against the loaded course list, not
trusted.

THE COURSE IS NOT JUST A LABEL. `useReplyRows(courseId)` FILTERS the table to rows
tagged with that course (`useReplyRows.ts:46-52`, `:412`, `:961-962`), and
`clearTable`/`moveRow` are scope-aware (`:651`, `:759-767`). Changing `courseId`
from `""` to X therefore changes which rows the instructor sees AND which rows
"Delete table" removes. This is the constraint every course-seed design must
carry (W-A, section 5).

---

## 3. WHERE THE CLICKS GO

Each mechanism says what it removes, what it does NOT touch, and what it does to
a guard.

### C1. Fab "Recording tools" lands on the remembered view (arrival, 4 -> 3)

Mechanism: add a navigation launch that does NOT name a view
(`recording-launch.ts` `RecordingLaunchView` union at `:57-69`, validator
`RECORDING_LAUNCH_VIEWS` at `:71-84`, `navigateToRecordingTool` at `:332`), so
`RecordingTab`'s handler (`RecordingTab.tsx:97-113`) leaves `recView` alone while
`page.tsx:155-173` still switches the instructor to Tools > Recording. Removes:
1 click for any instructor whose last Recording view was Discussion replies, and
the silent overwrite of `ta-rec-view`. Does not touch: any confirm. Cost: a
behaviour change for fab users who relied on landing on `record` - see F3.

### C2. Seed the course on first visit (first visit, 3 -> 1)

Mechanism: when `ta-rec-disc-course` has NEVER been written (raw read is `null`,
not `""` - a deliberate "No course selected" writes `""`, `:141`), and exactly
one valid candidate exists among the six sibling course keys, set the course once.
Removes: 2 clicks, once, per surface; it does not remove the per-session cost
for an instructor who works across courses (nothing can know which board they
are about to scroll). It saves very little on its own: say so, and see F2.

Guards that must be IN the design, because section 2.4's scope fact makes a naive
seed unsafe:

- Seed only when no persisted row exists (`ta-rec-disc-table` empty), so a seed
  can never hide rows. Instrument: `rawRows.length === 0` at seed time, read
  from the hook (`useDiscussionReplies.ts:202`, `rowsApi.rawRows`).
- Seed only BEFORE the first capture of the page load. Start is not gated on
  `coursesLoading` (`DiscussionRepliesPanel.tsx:533-539` never reads it), and the
  courses list loads lazily (`useDiscussionCourses.ts:53-83`), so a slow list
  could otherwise seed mid-capture and split one table into untagged and
  tagged halves. Instrument: a "capture started this load" boolean.
- Validate the candidate against the loaded `courses` list; a foreign or stale id
  must not reach the select (MUI warns on a value with no matching option, and
  `useReplyRows` would scope to a course that does not exist).
- The seeded value is shown, labelled, and overridable: a visible hint line
  names the course and says it was taken from another recording tool, in the
  Capture fieldset beside the select. The select itself is unchanged, so every
  existing control and its A20 pin stay.
- The seed does not overwrite an explicit choice, and does not write the sibling
  key. Whether it writes `ta-rec-disc-course` itself is an architect question
  (writing it makes the seed an explicit choice later; not writing it re-seeds on
  every load until the instructor chooses).

### C3. Considered and NOT proposed, with the reason

| Idea | Clicks saved | Why not |
|---|---|---|
| Collapse the four settings fieldsets behind a "Settings" disclosure | 0 on the repeat path (it is already 1 click) - it saves SCROLL, and adds 1 click to change anything | Reverses `docs/reply-composition-controls-acceptance-criteria.md:29-39` (C0-0): the composition cluster goes above Start with "no disclosure" because `enqueueDrafts(addedIds, draftDispatchForce("auto"))` fires as posts merge DURING capture (that AC cites it at `useDiscussionReplies.ts:426`; the call is at `:497` in the tree now, `[READ]`), and a disclosure would hide the address-by-name toggle that is ON by default. That is a design decision from an earlier activity, not an owner decision; I searched `docs/owner-decisions-2026-09-23.md` and `-09-27.md` for disclosure/collapse and none bears on this surface. Fork F4. |
| Move Start capture above the settings | scroll only | Same C0-0 reasoning. F4. |
| Start the share when the tab is opened | 1 | A screen-share prompt on tab entry is a surprise consent request, and a reload restoring `ta-rec-view` has no user gesture. Not a click-cost trade worth making. |
| Merge "save recording" and "download automatically" into one three-way control | 1, once | Replaces two pinned checkboxes (`DiscussionCaptureSettings.wiring.test.ts:30-53` anchors on the label and the `checked`/`onChange`/`disabled` text) for a one-time one-click gain. |
| `displaySurface` hint on `getDisplayMedia` | UNDETERMINED, possibly 0 | `useSnapshotCapture.ts:121-124` already passes `displaySurface: "window"` for a privacy reason, not a click reason. Whether any hint changes the Chromium picker's default pane for a Canvas tab is external-facts `[UNDETERMINED]` and I will not claim it. Not built; residual R-3. |

---

## 4. ACCEPTANCE CRITERIA

Target, stated as numbers with the instrument and the direction of failure.
MACHINE = a structure, wiring or pure-function test can pin it (nothing renders).
OWNER = only a browser can show it.

Leverage claim (one paragraph, per `docs/loop/leverage.md`): CLICK COST on an
existing capability. What the instructor does today: opens the fab, opens
Recording tools, opens the Discussion replies tab, then (first visit only)
opens the course select and chooses. What it costs: 3 clicks of arrival and 2 of
first-visit setup per surface, repeated for every Recording sibling. Claims
nothing categorical over a chat; its removal test (AC-8) is OWNER because no
test here observes clicks.

| ID | Criterion | Object compared | Instrument | Direction of failure | Tag |
|---|---|---|---|---|---|
| AC-1 | Fab -> Discussion replies capture armed: 4 in-app clicks today, 3 after. The fab "Recording tools" entry no longer forces `recView`; the instructor lands on their last Recording view. | the navigation launch a "Recording tools" click dispatches and `RecordingTab`'s handler | pure test over `parseRecordingLaunch`/the new view-less launch in `src/lib/recording-launch.test.ts`; source-text wiring assertion that `RecordingTab.tsx`'s listener does not call `setRecView` for a view-less detail | RED if the dispatched detail still carries `view: "record"`, or the handler still calls `setRecView` unconditionally | MACHINE |
| AC-2 | The fab entry still opens Tools > Recording (the page.tsx switch still fires). | `page.tsx` launch handler vs a view-less detail | wiring assertion that `page.tsx`'s handler reaches `setManualView("recording")` for a view-less detail | RED if a view-less launch is dropped by `parseRecordingLaunch` (the instructor would click the fab and nothing would open) | MACHINE |
| AC-3 | Existing launches are unchanged: every named view still validates and still switches `recView`; the Knowledge "Start recording" still lands on `discussions` carrying its context. | `RECORDING_LAUNCH_VIEWS` and `parseRecordingLaunch` outputs for every existing view | the existing `src/lib/recording-launch.test.ts` cases, re-run through `npm run test:paths` | RED if any existing case changes; the count of valid views may only rise by exactly the view-less form | MACHINE |
| AC-4 | Course seed predicate: returns a course id only when ALL hold: own key never written, zero persisted rows, no capture yet this load, candidate present in the loaded course list. Otherwise returns none. | the pure function's output over a table of inputs | a unit test with one row per failing condition (own key `""` vs `null`, rows 1 vs 0, capture started, candidate absent from list, two siblings disagreeing) | RED if any single failing condition still returns an id; every row of the table must be asserted, not a sample | MACHINE |
| AC-5 | The seed never overwrites an explicit course choice, and never changes the visible table scope while rows exist. | the hook's behaviour against its inputs | wiring assertion that the seed call is gated on the same predicate AC-4 tests, in the file that CALLS it | RED if the call site bypasses the predicate | MACHINE |
| AC-6 | A seeded course is visibly labelled. | `DiscussionCaptureSettings` output | wiring assertion that a hint string naming the seeded course exists and is rendered from a prop the caller sets | RED if the prop exists but nothing renders it | MACHINE (presence) + OWNER (legibility) |
| AC-7 | In-app clicks from the panel to arming, repeat session, stays at exactly 1; no new control between arrival and Start is required, and Start has no new `disabled` dependency. | `DiscussionRepliesPanel.tsx`'s Start button | wiring assertion over the Start `<Button>` JSX in `DiscussionRepliesPanel.tsx` (no `disabled=` added) | RED if a `disabled=` or a new gate appears on it. Direction: count rising above 1 is the failure | MACHINE |
| AC-8 | Guards unchanged: Delete table, Redraft every reply, row Remove and Redraft-edited-row still arm then confirm; both arming signatures still read `totalCount`/`courseId` as today. | the confirm components and the two signature expressions | the existing `discussion-table-view.test.ts:757-765`, `redraftRow.wiring.test.ts`, `discussion-capture.test.ts` suites, plus a count assertion that `ConfirmArmButtons` usage in `DiscussionCaptureSettings.tsx` is still 1 | RED if any existing case fails or the count drops | MACHINE |
| AC-9 | THE FELT COUNT. Fab-to-armed is 3 and first-visit-with-course is 1 in a real browser; the course hint is readable; the seeded course is correct for a real Canvas course. | the instructor's click sequence | owner counts clicks in Chrome from the fab to the picker opening, once on a fresh profile and once on a returning one | RED if the count is not 3 / 1, or the seed picks a wrong course | OWNER |
| AC-10 | NO PICKER CLAIM. The scope asserts nothing about the share picker's click count. | - | owner counts picker clicks (R-3) | not a gate | OWNER |

Number-bearing criteria and their instruments: "4 -> 3", "3 -> 1", "1 stays 1"
are `[ARITHMETIC]` over section 2's READ rows; the only measurable instrument
for the count itself is the owner's own click count (AC-9). The MACHINE criteria
pin the MECHANISM that produces the count, not the count.

---

## 5. WAVE PROPOSAL

Dispatch rule (`seats.md:160-164`): a wave that adds an export ships its caller
in the same push, so the "pure leaves -> wiring -> surface" order below is the
BUILD ORDER inside each item's single push, not three separate pushes. Pure
leaves and their tests land first within the item; each item pushes once.

Line figures `[MEASURED @(Get-Content <file>).Count in PowerShell]`.

### Item W-B (fab arrival, AC-1..AC-3) - small, independent

| Step | Write set | Lines now | Note |
|---|---|---|---|
| Leaf | `src/lib/recording-launch.ts` (+ `.test.ts`) | 349 / 616 | add the view-less form; keep `isValidView` strict for the rest |
| Wiring | `src/app/components/AiChatFab.tsx` | 924 | `:441-443` call changes; <= +5 lines; NEAR THE CEILING, 76 free |
| Wiring | `src/app/components/RecordingTab.tsx` | 909 | handler `:97-113`; <= +8 lines; ceiling pinned by `recording-split.structure.test.ts:58-64`; 91 free |
| Check | `src/app/page.tsx` | 842 | read; edit only if its handler needs the view-less case (`:155-173`) |

If F3 chooses option (ii) instead (a dedicated fab entry), the write set becomes
`FabQuickActionsMenu.tsx` (260) + `FabQuickActionsMenu.wiring.test.ts` (79) +
`AiChatFab.tsx`, and `RecordingTab.tsx` is not touched.

Top-level `src/app/components/*.tsx` files are scanned by
`componentStorageKeys.structure.test.ts`, non-recursively, for ANY `ta-` string
in raw source including comments. W-B must therefore add no `ta-` literal (not
even in a comment) to `AiChatFab.tsx` or `RecordingTab.tsx`, or that canary goes
red; this wave needs none.

### Item W-A (course seed, AC-4..AC-6) - only if F2 says yes

| Step | Write set | Lines now | Note |
|---|---|---|---|
| Leaf | NEW `discussion-course-seed.ts` + `.test.ts` (recording/ or `src/lib/`; architect's call, priced below) | new, ~60 | pure predicate + the list of sibling key names |
| Wiring | NEW `useDiscussionCourseSeed.ts` (one-shot effect; must use the repo's async-IIFE-with-cancel setState-in-effect idiom, `LectureScriptPanel.tsx:46-66` is the precedent) | new, ~50 | |
| Caller | `useDiscussionReplies.ts` | 915 | one call; the `captureRef.current.start({ call is a pinned anchor (`useDiscussionReplies.wiring.test.ts:98-107`) - do not edit near it. Headroom 85 |
| Return shape | `discussion-draft-loop.ts` (declares `UseDiscussionRepliesReturn`, `:92`) | not measured | only if the seeded flag rides the hook's sealed return; avoidable if the panel calls the seed hook itself (priced: panel then grows) |
| Surface | `DiscussionCaptureSettings.tsx` | 221 | hint line + prop |
| Surface | `DiscussionRepliesPanel.tsx` | 951 | pass the prop through; <= +3 lines; 49 free. THE LARGEST FILE IN THE WAVE. Its JSX is pinned by path in `AddKnowledgePages.test.ts:261-273` and `discussion-knowledge-context.test.ts:376-394`; edit nothing near the `knowledgeContextLabel` block |
| Canary | `recording-split.structure.test.ts` | 610 | `:352` exact-set of `ta-rec-*` keys over the recording dir + RecordingTab. A leaf INSIDE `recording/` that names `ta-rec-grade-course`, `ta-rec-mod-course`, `ta-rec-msg-course`, `ta-rec-wta-course` adds four names not in that list, so the list must be edited in the same push. Placing the leaf in `src/lib/` avoids the edit; either is legal, price it in the architect pass |

Files near the 1000-line ceiling, measured: `useDiscussionReplies.ts` 915,
`DiscussionRepliesPanel.tsx` 951, `RecordingTab.tsx` 909, `AiChatFab.tsx` 924.
The task brief named RecordingTab ~909 and useTakeAnnouncement ~915; RecordingTab
is 909 `[MEASURED]`. `useTakeAnnouncement.ts` is not in this scope's write set and
I did not measure it - the 915 in the brief is `useDiscussionReplies.ts`'s
measured figure, which suggests the two were conflated upstream; the
orchestrator should re-measure `useTakeAnnouncement.ts` itself.

Each item ends with `docs/REGRESSION.md` (orchestrator-owned) and its own gates.
Multi-file test runs use `npm run test:paths <p1> <p2> ...`, never a raw
multi-path vitest.

---

## 6. OPEN FORKS (each shaped so every answer terminates the activity)

I have acted on my own recommended reading of each and recorded it as MY reading,
not an owner ruling. Nothing below needs an answer before W-B can be built.

**F1. What does "set up" cover?** The activity produces ONE of:
(a) arrival-only: W-B; (b) arrival plus first-visit course: W-B + W-A; (c) (b)
plus the Message replies tab mirrored (the same two items against
`message-replies/`). Whichever you pick, the activity is done and the others
become residuals with an owner. RECOMMENDED: (b). Already started: nothing is
built; this scope is the starting point. Cost of answering (a): W-A's design is
discarded (cheap, it is paper); cost of (c): one more item, disjoint by path
from every file above.

**F2. May the course be auto-selected at all?** The seed changes which rows the
instructor sees and which rows Delete table removes (section 2.4), so I will not
decide it for you. Terminating: (yes) W-A ships with the four guards in
section 3 C2; (no) W-A is dropped and F1 is read as (a). RECOMMENDED: yes, with
the guards, since it saves only 2 clicks once and I would not take the scope
risk if you read the saving as too small.

**F3. How should the fab reach Discussion replies?** (i) "Recording tools" lands
on the remembered view (W-B as written; changes where an existing fab user lands
on `record`); (ii) add a dedicated "Discussion replies" fab entry (reverses F4's
five-entry decision; the same 3 -> 2); (iii) leave the fab alone. RECOMMENDED:
(i). Either answer ends the activity; (iii) removes W-B and leaves arrival at
4 clicks.

**F4. Do you want Start capture reachable without scrolling?** Terminating:
(yes) this reverses C0-0 (`reply-composition-controls-acceptance-criteria.md:29-39`)
and needs its own design pass, which is a NEW activity, not part of this one;
(no) C3 stands. RECOMMENDED: no. It saves no clicks.

THE QUESTION I CANNOT ANSWER FROM THE TREE, and it matters more than F1-F4:
**H1. After a reload, does the Discussion replies tab show your saved course,
audience and checkboxes?** All of them restore through a `useState` initializer
that reads `localStorage` (`discussion-persisted-controls.ts:127-206`). This repo
has recorded that exact pattern failing visibly once - a `<details open>` seeded
this way "never showed on reload" because React warns on the hydration mismatch
and does not patch it (`LectureScriptPanel.tsx:46-66`,
`SourceDevicesPanel.tsx:53`, `:139-142`). Whether it fails for MUI Select text,
checkboxes and the segmented toggle is `[UNDETERMINED]` and needs a browser. If
it does fail, "set up every session" is the owner's real experience and the
right item is a mount-effect restore on these controls, not anything above.
Not a gate; filed as residual R-1.

---

## 7. INTERACTION with in-flight work

In flight, per the orchestrator: `takeAnnouncementTranscription.ts`, a new
`take-announcement-draft.ts`, the draft path in `useTakeAnnouncement.ts`, and the
grader. `git status --short` at the time of writing `[MEASURED]` shows only docs
modified (`docs/a29-acceptance-criteria.md`, `docs/a29-architecture.md`,
`docs/css-orphans.md`, untracked `docs/loop-retro-roles-acceptance-criteria.md`),
so I could not read those agents' write sets from the tree; intersect by exact
path at dispatch with `sort | uniq -d` and a canary.

Exact-path overlap by my reading:

| My file | Possible collision | Severity |
|---|---|---|
| `src/app/components/RecordingTab.tsx` (W-B) | It owns `announcementTake` and mounts `TakeAnnouncementPanel` (`:34-35`, `:817`) and imports `useTakeAnnouncement`. A draft-path wire-up that adds props or state there collides on the same file, which is also 91 lines from its ceiling | REAL RISK. Sequence W-B after that work lands, or give it to the same agent |
| `src/app/components/recording/recording-split.structure.test.ts` (W-A) | The `ta-rec-*` exact-set canary (`:352`) is shared: a new `ta-rec-ann-*` key from the draft work and my four sibling-course names both edit the same array | REAL RISK if W-A places its leaf in `recording/`. Avoided by placing the leaf in `src/lib/`; the draft work's own key edit is theirs |
| `src/app/components/recording/useTakeAnnouncement.ts`, `takeAnnouncementTranscription.ts`, `take-announcement-draft.ts` | none of my waves write them | none |
| `src/app/components/AiChatFab.tsx`, `src/lib/recording-launch.ts` | not named by the in-flight work; `[UNDETERMINED]` whether the draft path adds a launch view | LOW |
| Grader files (`grading-recording/**`, `src/lib/grade/**`) | none; `GradingRecordingPanel.tsx:183` is only READ (a sibling course key) | none |

No wave writes `docs/BACKLOG.md`; the orchestrator does, at disposal.

---

## 8. Residual register

| ID | What is not proven now | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R-1 | H1: persisted setup restoring visibly after reload | repo owner | a real browser: set course, audience, save-video, reload, look | before W-A is dispatched; takes under a minute; changes F1 if it fails |
| R-2 | The felt click count: fab to armed is 3, first visit with course is 1 (AC-9) | repo owner | count clicks in Chrome on a fresh and a returning profile | the Verify step after the item ships |
| R-3 | The share picker's click count, and whether any `displaySurface` hint changes it (AC-10, section 2.2) | repo owner | count picker clicks with and without a one-line hint experiment | after W-B, only if the owner still feels setup is slow; no wave builds against it |
| R-4 | Whether every sibling `ta-rec-*-course` key holds a course_hub uuid (section 2.4) | the architect seat | open each key's writer and the select it feeds | the W-A architect pass; AC-4's membership check makes the seed safe regardless |
| R-5 | Click cost of `AddKnowledgePages` (row 10) | the UX seat | open `AddKnowledgePages.tsx` and count | the UX pass, only if the owner names it |
| R-6 | `useTakeAnnouncement.ts` line count (the brief's "~915") | orchestrator | `@(Get-Content src/app/components/recording/useTakeAnnouncement.ts).Count` | at dispatch, when sequencing against the draft work |

Disposition table: not applicable - this is the first version of this scope, not
a restructure of a prior one.

---

## 9. What I opened, so a checker can re-walk it

`docs/DEV_LOOP.md`, `docs/loop/seats.md` (lines 1-210), `docs/loop/traps-spec.md`,
`docs/loop/leverage.md` (excerpts), `DiscussionRepliesPanel.tsx` (whole),
`DiscussionCaptureSettings.tsx` (whole), `DiscussionReplyControls.tsx` (whole),
`DiscussionResourceSettings.tsx` (whole), `discussion-persisted-controls.ts`
(`:1-330`), `useDiscussionCourses.ts` (whole), `useDiscussionCapture.ts`
(`:395-470`), `useDiscussionReplies.ts` (`:560-660`), `RecordingTab.tsx`
(`:40-170`, `:585-645`, `:840-895`), `recording-launch.ts` (`:1-120`, `:296-345`),
`AiChatFab.tsx` (`:420-470`), `FabQuickActionsMenu.tsx` (`:40-60`, `:150-175`),
`useAppNavigation.ts` (`:1-135`, `:225-330`), `useSnapshotCapture.ts`
(`:1-30`, `:108-135`), `recording-split.structure.test.ts` (`:1-60`, `:296-470`),
`componentStorageKeys.structure.test.ts` (`:1-80`), `DiscussionCaptureSettings.wiring.test.ts`
(whole), `docs/recording-controls-ux-acceptance-criteria.md` (`:690-730`),
`docs/reply-composition-controls-acceptance-criteria.md` (`:29-43`).
Not opened and therefore not claimed: `AddKnowledgePages.tsx` click cost,
`discussion-draft-loop.ts` beyond the interface name, the top-level tab strip,
`SegmentedToggle.tsx` beyond its button markup, `MessageRepliesPanel.tsx` beyond
its grep hits.
