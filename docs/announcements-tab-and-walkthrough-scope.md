# Announcements sub-tab (IA move) + walkthrough click/scroll pass - recon and scope

Status: SCOPE + RECON, authored by `loop-architect` (Opus) on 2026-10-04. Not yet
checked. Two owner requests, scoped together because they share one surface cluster.
No production or test code was written; this file is the only artifact.

Covers two backlog rows:

- **ANNOUNCEMENTS-TAB** (foundational) - owner verbatim: "announcement tools need to
  be put into their own Announcements tab, underneath the tools tab."
- **WALKTHROUGH-OVERHAUL** (depends on #1) - owner verbatim: "the announcement
  walkthrough needs to have the click distance/scroll distance pass made."

Evidence tags:

- `[MEASURED <cmd>]` the command was run in this checkout and its output is quoted.
- `[READ file:line]` I opened that file at that line. Nothing in this repo renders a
  component under vitest (`docs/loop/this-repo.md` section 6), so every claim about
  nav, markup, click count or pixel is a READ/ARITHMETIC claim, never an observation.
- `[ARITHMETIC]` computed from READ facts; the runtime was not observed.
- `[UNDETERMINED]` I could not establish it here and say so.

What I could not do, stated once: run the app, click a chip, observe a reload, or
measure a pixel. Every OWNER-tagged criterion below exists because no instrument here
can settle it.

---

## 0. Headline

1. **The "Tools tab" is `activeTab === "manual"` (label "Tools").** Its sub-tabs are
   a SINGLE flat rail of 11 chips built from two ordered lists: the 8 Manual views
   (`MANUAL_VIEW_ORDER`) plus the 3 Workflows views (`WORKFLOWS_VIEW_ORDER`)
   `[READ tab-rails.ts:132-149]`. A new Announcements sub-tab = a new `manualView`
   chip in that rail, following the exact pattern of the Grading sub-tab (which has
   its own inner nav for run/repos/recording/snapshots/drafts/chat). This is the
   backlog's stated reading and the tree confirms it is the one existing mechanism.
2. **The announcement tools are scattered across TWO different Tools-rail chips and
   three inner locations** (section 2): the Canvas composer and the A29 bulk-message
   panel both sit under Tools > LMS > Announcements; "Announcement from a walkthrough"
   and "Record announcement" are two separate Recording sub-tabs. Grouping them is a
   genuine cross-cutting move.
3. **Registering a new Tools sub-tab is CENTRALISED and safe - it is NOT the 5-edit
   recording-sub-tab trap** (`docs/loop/traps-spec.md:59-64`). A `manualView` added to
   `MANUAL_VIEW_ORDER` auto-joins the rail (`tab-rails.ts:133`), auto-validates on
   restore (`isManualViewType`, `useAppNavigation.ts:265`), and auto-persists under
   the existing `ta-manual-view` key - no hand-written restore ladder. The only
   hand-edits are the label, the page.tsx render branch, and (if the sub-tab has an
   inner nav) the inner-nav table plus a `ta-announcements-view` key.
4. **The EXPENSIVE direction is moving the two CAPTURE surfaces (walkthrough,
   record-announcement) OUT of RecordingTab.** That trips the recording-split
   structure canaries (strip count, tabpanel count, restore guard) AND the `recView`
   restore ladder - the real 5-edit trap. The precedent is exact: GRAD-SUBTAB wave 2
   moved two capture surfaces out of Recording the same way (`recording-split.
   structure.test.ts:137-157`). Take-announcement is additionally deep-coupled to
   RecordingTab's take library (fork T1).
5. **REQUEST 2 is PREDOMINANTLY (a), not (b), and the backlog's hypothesis is
   DISPROVED by the tree.** The backlog row says SMOOTH-WALKTHROUGH W3 "did not touch"
   the draft-review/post steady-state. It did: `git diff --stat` shows W3 changed
   `AnnouncementDraftSlot.tsx` by 113 lines `[MEASURED]`, and at HEAD the steady-state
   already has message+preview side-by-side, the Visible-to control inside the Post
   row, and the arm-notice reordered below the row (section 4). The genuine remaining
   (b) residue is NARROW: two stacked selects not yet on one row, and no
   scroll-into-view of the first draft. The dominant REQUEST-2 win is the LOCATION
   change from REQUEST 1.

Triage (per `docs/loop/seats.md` table), recorded with the fired trigger:

| Seat | Runs? | Trigger |
|---|---|---|
| Acceptance criteria | YES | always |
| Architect + reuse | YES | new sub-tab, cross-cutting move, >2 files |
| User experience | YES | user-visible nav + flow |
| Data / storage | YES | new `ta-announcements-view` key + the two key canaries |
| Visual / aesthetic | YES | new surface layout + the select-row change |
| Accessibility | YES | tablist markup move; reading claims only |
| Operability / admin | NO | no owner config/audit/revoke surface added |
| Security | CONDITIONAL | no NEW egress/action - all moved tools keep their existing actions. Runs only if the architect finds a moved prompt/egress path changes |
| Reliability | CONDITIONAL | the moved capture surfaces keep their existing MediaStream lifecycle; runs if the always-mounted re-parenting changes a teardown |
| External-facts research | NO | nothing rests on a library/platform contract outside this repo |
| Baseline | YES | the tab system + each tool's current home must be baselined in `docs/REGRESSION.md` before the move (orchestrator-owned) |
| Test seat | YES | always; constructs the oracle after Build/Verify |

Leverage claim in section 5.

---

## 1. RECON: the tab system, and how a new sub-tab registers

### 1.1 The three nav levels

| Level | State param | Where | Values |
|---|---|---|---|
| Top strip | `activeTab` | `tab-sections.ts:31,36`; rendered `page.tsx:458-470` | `courses` / `manual` (label **"Tools"**, `tab-sections.ts:38-43`) / `files` (label "Library") / `course-intel` |
| Tools rail (the sub-tabs) | `toolsSection` + `manualView` + `workflowsView` | rail built `tab-rails.ts:132-149`; rendered `page.tsx:524-529` | 11 chips: 8 `manualView` + 3 `workflowsView` |
| Inner nav (only some chips) | `buildView` / `contentView` / `gradingView` / `presentationsView` | `ManualRail.tsx` (80 lines); `page.tsx:538-559`; table `manual-rail.ts:225-232` | e.g. Grading -> run/repos/recording/snapshots/drafts/chat |

The "Tools tab" renders at `page.tsx:517` (`activeTab === "manual"`). Its rail value is
`toolsRailItemFor(toolsSection, manualView, workflowsView)` `[READ page.tsx:527; tab-rails.ts:163-169]`.
The 8 current `manualView` chips `[READ manual-rail.ts:185-205]`: Build Courses,
LMS, Version Control, **Recording**, PowerPoint Design, Artifact Templates,
Presentations, Grading. The backlog's phrase "Tools already has Grading/Recording
sub-tabs" means these rail chips, and "the GRADING-CHAT Chat sub-tab lives under
Tools>Grading" means the Grading chip's inner nav `gradingView === "chat"`.

### 1.2 Exactly what registers a NEW Tools sub-tab (`manualView = "announcements"`)

Derived by reading the mechanism, not a doc. A new `manualView` requires, and only
requires:

| # | Edit | File:line | Why |
|---|---|---|---|
| R1 | Add `"announcements"` to the `ManualViewType` union | `manual-rail.ts:14-22` | the type |
| R2 | Add `"announcements"` to `MANUAL_VIEW_ORDER` | `manual-rail.ts:185-194` | **auto-joins the Tools rail** (`tab-rails.ts:133`), **auto-validates on restore** (`isManualViewType`, derived from this list, `manual-rail.ts:213-217`), and **auto-persists** under `ta-manual-view` (`useAppNavigation.ts:265`). No ladder. |
| R3 | Add label to `MANUAL_VIEW_LABELS` | `manual-rail.ts:196-205` | the chip text "Announcements" |
| R4 | Add a render branch `manualView === "announcements"` in page.tsx | `page.tsx` (new, near :586-660 for non-capture mounts; near :693-757 for always-mounted capture mounts) | the mount. **This is the surface the user reaches** - see R6/R7. |
| R5 | IF the sub-tab has an inner nav: add to `INNER_NAV`, add a `destinations` group, extend `getActiveDestinationId` and `resolveStateFromDestinationId`, add a `ta-announcements-view` key + validator in `useAppNavigation.ts` mirroring `gradingView`/`ta-grading-view` (`useAppNavigation.ts:55,373-413`) | `manual-rail.ts:99-161,225-232,261-393`; `useAppNavigation.ts` | the inner chips |
| R6 | Bump the TOOLS_RAIL_ITEMS exact-count canary 11 -> 12 | `tab-rails.test.ts:67` AND `topLevelTabs.wiring.test.ts:376` `[MEASURED grep -n]` | both pin `toHaveLength(11)` and both go red on a new chip |
| R7 | IF a capture surface moves out of RecordingTab (walkthrough, record-announcement): update the recording-split canaries and the `recView` ladder | section 3 | the expensive direction |

**THE SURFACE IS A LAYER (recorded failure mode).** The user reaches an announcement
tool by: top strip is already "Tools" by default (`DEFAULT_TAB = "manual"`,
`tab-sections.ts:47`) -> click the "Announcements" rail chip (writes
`manualView=announcements`) -> click an inner-nav chip (writes `announcementsView`).
R4 is the mount that makes the chip show something; R5 is the inner nav that makes
"the tools under it" reachable. Omitting R5 ships a chip that can show only one tool.

---

## 2. The announcement-tools inventory (the move list)

Each tool, its component, its CURRENT home, and its mount `file:line`. Sizes
`[MEASURED @(Get-Content <f>).Count]`.

| Tool | Component (lines) | Current home | Mount `file:line` | Holds live capture? |
|---|---|---|---|---|
| **Announcement from a walkthrough** | `WalkthroughAnnouncementPanel.tsx` (839) | Tools > Recording > recView `walkannounce` | `RecordingTab.tsx:879-880`; strip entry `:596`; recView union `:61` | YES (`useDiscussionCapture`) |
| **Record announcement** (record FOR an announcement; draft a Canvas announcement from a take) | `TakeAnnouncementPanel.tsx` via `useTakeAnnouncement` | Tools > Recording > recView `announcement` (shares the Record panel) | `RecordingTab.tsx:816-829`; strip entry `:596`; opened by `openAnnouncement` `:265-276`, take rows `:727/:740`, library `:497-502`; course key `ta-rec-ann-course` `:173,530` | YES + deep-coupled to RecordingTab's take library/recorder singletons |
| **Canvas announcement composer** | `announcements-panel.tsx` (533) | Tools > LMS > `contentView` `announcements` | `CanvasTab.tsx:3,14-16` -> `ContentTab` (`page.tsx:586-593`); institution chrome `ContentTab.tsx:10,76` | NO |
| **Bulk course message (A29)** | `bulk-course-message/BulkCourseMessagePanel.tsx` (280, untracked/in-flight) | Tools > LMS > Announcements, directly below the composer | `CanvasTab.tsx:5,17` (comment `:11-12`: "sits under the announcements composer; this file is its only host mount") | NO |

So the four tools span **two** Tools-rail chips (Recording, LMS) and three inner
locations. The owner's request is to collapse that into one Announcements chip.

Note: A29 (`bulk-course-message/`) is UNTRACKED and in-flight `[MEASURED git status
--short]`; it is the sibling A29 item's write set. Any move of it must serialise
after A29 lands - flagged in section 7.

---

## 3. The two containers a move touches (collisions)

### 3.1 Moving the capture surfaces OUT of RecordingTab (the recording cascade)

If `walkannounce` (and/or `announcement`) leave RecordingTab, these all change in the
SAME commit or the gate goes red / the view silently reverts on reload:

| Enforcer | What it pins | `file:line` | Effect of removing walkannounce |
|---|---|---|---|
| Strip exact-count canary | "exactly ten inner-view tabs" | `recording-split.structure.test.ts:141-147` `[READ]` | 10 -> 9; must bump |
| Tabpanel-count canary | "nine tabpanel content divs" + `panelTargets.size === 9` | `:206-208,238` `[READ]` | 9 -> 8; drop `walkannounce` from the key list `:225-229` |
| Restore-chain canary | chain accepts every non-default recView | `:174-181` `[READ]` | drop `walkannounce` from the chain; add a mirror "NOT accepted" guard like `:187-191` |
| `recView` union | the type | `RecordingTab.tsx:61` `[READ]` | drop `"walkannounce"` |
| `recView` restore ladder | the `v === ...` chain | `RecordingTab.tsx:65-73` `[READ]` | drop `v === "walkannounce"` - **omitting this is the exact trap in `traps-spec.md:59-64`: structure test green, view reverts to Record on reload** |
| Dedicated-announcement-entry assertion | strip has an `["announcement", ...]` tuple | `:150-151` `[READ]` | only if `announcement` ALSO moves |

Moving `announcement` (record-announcement) additionally unwinds the shared
record/announcement panel aria wiring (`RecordingTab.tsx:599,638`;
`recording-split.structure.test.ts:206,246-268`) and the take-library coupling
(`openAnnouncement`, `announcementTake`, `postedByTakeId`, library draft) - a large,
high-regression surgery. Fork T1.

### 3.2 Moving the Canvas composer OUT of LMS (the LMS cascade)

If `AnnouncementsPanel` leaves `CanvasTab`/`ContentTab`:

- `ContentView` member `"announcements"` and the `lms-announcements` rail destination
  (`manual-rail.ts:115`) orphan; `LMS_VIEW_PRESENCE` (`manual-rail.ts:85-93`) and
  `validateLmsViewsCompleteness` (`:395-415`) pin announcements as an LMS view and go
  red - they must change, or the composer must be MIRRORED (kept in LMS too).
- `CanvasTab.tsx` currently returns `<AnnouncementsPanel/><BulkCourseMessagePanel/>`
  for `view==="announcements"` and `<InboxPanel/>` for inbox (`:14-21`). Removing the
  announcements branch leaves CanvasTab inbox-only, and `page.tsx:590`'s
  `announcements={<CanvasTab view="announcements" />}` prop into ContentTab must be
  rewired.
- **Institution-picker chrome.** `AnnouncementsPanel`/`CanvasTab` assume the PARENT
  supplies the institution switcher (`CanvasTab.tsx:10-11`); today that parent is
  `ContentTab` (`InstitutionSwitcher`, `ContentTab.tsx:10`; `useInstitutionSelection`,
  `:76`). The new Announcements container must render an `InstitutionSwitcher` of its
  own, or the composer reads `useInstitutionSelection()` directly (the hook is shared,
  `@/lib/institutions`) and the container renders the switcher. This is the biggest
  single piece of the LMS move; the architect wave owns resolving it (R-8).

### 3.3 1000-line ceilings on the touched containers `[MEASURED @(Get-Content).Count]`

| File | Lines | Headroom to 1000 | Direction this scope pushes it |
|---|---|---|---|
| `page.tsx` | 832 | 168 | UP (new render branch) |
| `RecordingTab.tsx` | 909 | 91 | DOWN (removes a mount) if walkannounce moves |
| `ContentTab.tsx` | 891 | 109 | DOWN slightly if composer moves out |
| `manual-rail.ts` | 415 | 585 | UP (union + order + label + inner nav) |
| `WalkthroughAnnouncementPanel.tsx` | 839 | 161 | flat (location change only) |
| `announcements-panel.tsx` | 533 | 467 | flat |

No file is near the wall after the move. The new Announcements container component
(if a dedicated file, e.g. `AnnouncementsSubTab.tsx`) is new and small.

---

## 4. REQUEST 2: the (a)/(b) determination, with tree evidence

**Question (from the backlog):** is the remaining walkthrough click/scroll pass (a)
what SMOOTH-WALKTHROUGH already delivered (route to the baseline walk, confirm, close)
or (b) genuine remaining cost in the draft-review/post steady-state?

**Finding: PREDOMINANTLY (a), with a narrow (b) residue - and the backlog's premise is
disproved.** SMOOTH-WALKTHROUGH W0-W3 shipped at `df2dff8d / ffaba04f / 6cac33d2 /
494826ec` `[MEASURED git log]`, and W3 (`494826ec`) touched the steady-state file the
backlog said it did not: `AnnouncementDraftSlot.tsx | 113 ++--` `[MEASURED git diff
--stat df2dff8d~1 494826ec -- src/app/components/walkthrough-announcement/]`.

Already shipped at HEAD (so NOT to be re-scoped), each `[READ]`:

| Item | What shipped | `file:line` |
|---|---|---|
| Sticky Start/run bar, two always-visible Generate buttons | setup/run scroll + click | `WalkthroughRunBar.module.css`; panel comments `:600,:653` |
| Auto-draft on stop (-1 click) | toggle + effect | `useWalkthroughAutoDraft.ts`; `WalkthroughAnnouncementPanel.tsx:389,485-488` |
| Message + Preview SIDE BY SIDE (was stacked) | ~1 preview-height of scroll | `AnnouncementDraftSlot.tsx:218-232` (`adaptFieldGrid2`) |
| Visible-to control INSIDE the Post row (was ~600px above) | cursor travel | `AnnouncementDraftSlot.tsx:296-320` |
| Arm-notice reordered BELOW the button row (was above, shifted Confirm) | no misclick shift | `AnnouncementDraftSlot.tsx:322-340` |

Genuine remaining (b) residue, each `[READ]`:

- **S2 - two stacked selects.** "Format to match" (`:121-137`) and "Written for"
  (`:139-152`) are still two separate full stacked rows, each `controls.fieldMd`, NOT
  wrapped in one `.adaptRow`. One extra ~1-row vertical hop + a cursor-down instead of
  a cursor-across. Costs zero clicks to fix; reuses the house `.adaptRow` pattern.
- **M8 - no scroll-into-view.** No `scrollIntoView` anywhere in
  `WalkthroughAnnouncementPanel.tsx` `[MEASURED grep -n scrollIntoView]` (0 hits), so
  on a short viewport the first drafted slot can land below the fold after Generate.

Plus the **location re-anchoring**: the whole surface moves under the new Announcements
sub-tab (REQUEST 1), which changes ARRIVAL clicks and is REQUEST 1's win, not a
steady-state change. The click/scroll MECHANISM of the draft slot is
location-independent; only the arrival changes.

**Disposal of REQUEST 2:** route the owner to re-walk the already-overhauled flow AT
THE NEW LOCATION and confirm (the (a) part, an OWNER step), and scope ONLY S2 and M8
as the (b) part. Do NOT rebuild W0-W3. The sibling scope
`docs/walkthrough-announcement-clicks-scope.md` is the DESIGN that SMOOTH-WALKTHROUGH
built from (it describes the pre-W0 panel at 991 lines); this scope does not
restructure it.

---

## 5. ACCEPTANCE CRITERIA

**Leverage claim** (`docs/loop/leverage.md`, one paragraph): this is a **click-cost /
navigation-cost and DISCOVERABILITY** change on existing capabilities, named as such -
NOT a categorical advantage over a chat, and the criteria do not pretend otherwise
(click-cost is "free to any feature with a UI", `leverage.md:66`, so it is claimed only
as explicit click-cost). Today an instructor who wants to send any announcement must
KNOW that "from a walkthrough" lives under Recording while "post to Canvas" lives under
LMS, and switching between two announcement tools costs 2 clicks (back out to the Tools
rail, into another chip). After grouping, every announcement tool is one chip, and
switching between them is 1 inner-nav click. The removal test is OWNER-only (AC-R1-7)
because no instrument here observes a chip or a click.

`MACHINE` = a pure-function / source-text / structure test can pin it (nothing
renders). `OWNER` = only a browser shows it. Every pass condition names the object, the
instrument, and the direction of failure (`docs/loop/traps-spec.md`).

### REQUEST 1 - the Announcements sub-tab

| ID | Criterion | Object compared | Instrument | Direction of failure | Tag |
|---|---|---|---|---|---|
| AC-R1-1 | `MANUAL_VIEW_ORDER` contains `"announcements"` and `MANUAL_VIEW_LABELS["announcements"]` is a non-empty string | `manual-rail.ts` arrays | source-text/structure test asserting membership + non-empty label | RED if either absent | MACHINE |
| AC-R1-2 | `TOOLS_RAIL_ITEMS` has length 12 and all ids and all labels are unique | the built rail array | the existing `tab-rails.test.ts` assertions, bumped from 11; the uniqueness asserts at `:93,:109` are already derived and need no edit | RED if length != 12, or any id/label collides | MACHINE |
| AC-R1-3 | Both exact-count canaries are bumped 11 -> 12 in the same commit as R2 | `tab-rails.test.ts:67`, `topLevelTabs.wiring.test.ts:376` | the canaries themselves | RED if a chip was added without both bumps, or a bump without the chip | MACHINE |
| AC-R1-4 | page.tsx has a render path for `manualView === "announcements"` that mounts the walkthrough panel (always-mounted, display-toggled) and the Canvas composer + bulk-message (conditional or always-mounted per the architect), and no other `manualView` branch renders them | `page.tsx` source order + the mount guards | source-text assertion that the panels' JSX appears under an `announcements` guard and NOT under their old guards; mirrors `topLevelTabs.wiring.test.ts`'s own always-mounted-sibling guards | RED if a moved panel is still only reachable from its old container, or is mounted under no guard | MACHINE |
| AC-R1-5 | The walkthrough panel is REMOVED from the recording strip, and the recording-split canaries are updated consistently (strip 10->9, tabpanels 9->8, `recView` union and restore ladder drop `walkannounce`, mirror "not accepted" guard added) | `RecordingTab.tsx` + `recording-split.structure.test.ts` | the recording-split canaries (run them in the wave gate - the pre-push gate runs NO vitest, `this-repo.md`) | RED if any count is stale, or the restore ladder omits the dropped value | MACHINE |
| AC-R1-6 | The Canvas composer is removed from (or explicitly mirrored in) LMS, and `LMS_VIEW_PRESENCE` / `validateLmsViewsCompleteness` / `CanvasTab` agree; `page.tsx:590`'s prop is rewired | `manual-rail.ts`, `CanvasTab.tsx`, `page.tsx` | `manual-rail.test.ts:142` (`validateLmsViewsCompleteness` returns no errors) + a source assertion on the rewired prop | RED if the LMS validator errors, or the composer is reachable under two homes without MIRROR being the chosen fork | MACHINE |
| AC-R1-7 | The new Announcements chip groups every moved tool; cross-tool navigation between any two is 1 inner-nav click; single-tool arrival is no more than before (2 from the Tools tab) | the rendered nav on a returning profile | owner clicks through it; compares against HEAD | RED if any moved tool is missing, or switching between two is more than 1 click | OWNER |
| AC-R1-8 | `ta-manual-view === "announcements"` restores the sub-tab on reload; the inner `ta-announcements-view` key restores the inner selection | the persisted keys | owner sets the sub-tab + inner view, reloads; MACHINE half: `isManualViewType` accepts it (derived, `manual-rail.ts:213-217`) and the new inner validator accepts it | RED if a reload drops to a different sub-tab or inner view | OWNER + MACHINE |
| AC-R1-9 | The new `ta-announcements-view` key is added to whichever directory key canary scans its file, in the same commit | the key canary (e.g. `componentStorageKeys.structure.test.ts` or a dir-local canary - the architect names the exact one against the new file's directory) | that canary | RED if the key is added without the bump | MACHINE |
| AC-R1-10 | No file in the write set ends over 1000 lines | `@(Get-Content <f>).Count` and `src/file-size-ceiling.structure.test.ts` | both | RED if any exceeds | MACHINE |

### REQUEST 2 - the walkthrough steady-state residue (scoped at the new location)

| ID | Criterion | Object compared | Instrument | Direction of failure | Tag |
|---|---|---|---|---|---|
| AC-R2-1 | "Format to match" and "Written for" share ONE `.adaptRow` wrapper (one row, cursor crosses left-to-right) | `AnnouncementDraftSlot.tsx:121-152` | source-text assertion that both selects are inside one `.adaptRow` element | RED if the two selects are not siblings in one adapt-row | MACHINE |
| AC-R2-2 | After a slot goes drafting->drafted and its top is below the viewport, it is scrolled into view once, honouring `prefers-reduced-motion`; no focus move | the panel's post-generate effect | source-text assertion that a `scrollIntoView({block:"nearest"})` guarded by a reduced-motion check exists and is NOT a focus call | RED if absent, or it moves focus, or ignores reduced-motion | MACHINE |
| AC-R2-3 | All post/guard behaviour is UNCHANGED by the move and the two residue fixes: arm-then-confirm on Post, the schedule-time-in-signature, the `wta-post-consequence` id and `aria-describedby`, the rendered preview present before Post, the preview uncapped | `AnnouncementDraftSlot.tsx` + the walkthrough structure/timing tests | `npm run test:paths <existing walkthrough test paths>` (never a raw multi-path vitest) | RED if any existing walkthrough guard fails | MACHINE |
| AC-R2-4 | The felt flow at the NEW location: arrive -> configure -> Start/Stop -> Generate -> review/edit -> Post/Confirm, with the two selects on one row and the first draft visible after Generate | the instructor's real sequence at the new sub-tab | owner re-walks it on a fresh and a returning profile | RED if any hop exceeds one viewport or a count regresses from the shipped SMOOTH-WALKTHROUGH baseline | OWNER |
| AC-R2-5 | Removal test for the leverage (click-cost) claim | the instructor's click count | OWNER-only: no vitest here observes a chip or a click (`leverage.md` "Honest limit"); recorded as a residual with an owner and a step (R-5) | not a gate | OWNER |

Number-bearing claims and their instruments: "11 -> 12" is `[MEASURED grep -n
"toHaveLength(11)"]` against `tab-rails.test.ts:67` and `topLevelTabs.wiring.test.ts:376`;
"10 -> 9" strip and "9 -> 8" tabpanels are `[READ recording-split.structure.test.ts:147,208,238]`;
"113 lines" is `[MEASURED git diff --stat]`; every file size is `[MEASURED
@(Get-Content).Count]`. The click counts in AC-R1-7 / AC-R2-4 are `[ARITHMETIC]` over
the cited rail structure and are OWNER-confirmed.

---

## 6. WAVES

Order: pure leaves -> wiring -> surface; every wave includes the file that CALLS each
new export (`seats.md` "Architect"). ANNOUNCEMENTS-TAB (the IA move) lands FIRST;
WALKTHROUGH-OVERHAUL builds after, against the new location. Both serialise on the
shared `walkthrough-announcement/` files with the completed SMOOTH-WALKTHROUGH work and
with in-flight A29 (`bulk-course-message/`). Line figures `[MEASURED @(Get-Content).Count]`.

### ANNOUNCEMENTS-TAB

| Wave | Write set (exact paths) | Notes |
|---|---|---|
| A-W1 REGISTRY (leaf) | `manual-rail.ts` (415), `manual-rail.test.ts`; `tab-rails.test.ts` (380) and `topLevelTabs.wiring.test.ts` (650) count bumps | R1/R2/R3/R5-registry + R6 canary bumps. The new `manualView` and inner nav are exports whose CALLER is A-W2's page.tsx; A-W1 must not ship alone (a leaf with no caller is dead with every gate green, `traps-spec.md`). Treat A-W1 + A-W2 as one push. |
| A-W2 MOUNT + MOVE (wiring/surface) | `page.tsx` (832); NEW `AnnouncementsSubTab.tsx` (container, small) OR inline branch; `RecordingTab.tsx` (909) + `recording-split.structure.test.ts` (610); `CanvasTab.tsx` (22) + `ContentTab.tsx` (891) + LMS validator edits in `manual-rail.ts`; `useAppNavigation.ts` (798) for the `ta-announcements-view` key; the directory key canary (R-9) | the move. Capture surfaces move as always-mounted display-toggled top-level siblings (GRAD-SUBTAB wave 2 precedent, `page.tsx:713-757`). Data + security + reliability + accessibility seats run here (new mount lifecycle for capture; institution-chrome relocation). FROZEN-ORACLE rule (memory `refactor-disarms-tests`): the recording-split canaries must keep independent literal expectations and a sabotage run (restore walkannounce to the strip) must go red. |
| A-W3 REGRESSION + OWNER NAV CHECK | `docs/REGRESSION.md` (orchestrator-owned) | orchestrator writes it; this scope writes no backlog/regression file. |

### WALKTHROUGH-OVERHAUL (after ANNOUNCEMENTS-TAB)

| Wave | Write set (exact paths) | Notes |
|---|---|---|
| B-W1 RESIDUE | `AnnouncementDraftSlot.tsx` (379) + `WalkthroughAnnouncementPanel.tsx` (839); the walkthrough structure/timing tests | S2 (two selects into one `.adaptRow`, reuse existing class - no new CSS) + M8 (scrollIntoView, reduced-motion). No guard touched. If a new CSS class is needed, `src/app/components/courses/page-module-css-orphan-classes.test.ts` goes red unless referenced, and `docs/css-orphans.md` is being edited by in-flight work (section 7) - sequence any CSS after that lands. |
| B-W2 OWNER WALK | owner re-walks at the new location (AC-R2-4) | the (a) half. |

Each wave ends with its own gates and `git status --short` against its list.
Multi-file test runs use `npm run test:paths <p1> <p2> ...`, never a raw multi-path
vitest (`this-repo.md`; `test-paths` memory). `npx tsc --noEmit` has one caller at a
time.

---

## 7. COLLISIONS (exact-path and shared-resource)

- `[MEASURED git status --short]` at authoring: modified
  `docs/a29-acceptance-criteria.md`, `docs/a29-architecture.md`, `docs/css-orphans.md`,
  `src/app/components/repo-grades/index.tsx`,
  `src/app/components/repo-grades/repo-grades.module.css`,
  `src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts`; untracked
  `docs/loop-retro-roles-acceptance-criteria.md`,
  `src/app/components/repo-grades/RepoGradesStickyHeader.tsx`,
  `src/app/components/repo-grades/repoGradesWaveASticky.structure.test.ts`, AND the
  in-flight A29 `src/app/components/bulk-course-message/`.
- **A29 (`bulk-course-message/`) is in-flight and its panel is one of the moved tools.**
  A-W2 touches `CanvasTab.tsx` which mounts `BulkCourseMessagePanel`. BUILD of the
  move MUST serialise AFTER A29 lands; until then, the move leaves the A29 panel where
  it is and only re-homes it once A29 is stable. The orchestrator sequences this.
- `docs/css-orphans.md` is being edited by other work; B-W1's only CSS risk is a new
  class - avoid one by reusing `.adaptRow`; if unavoidable, sequence after that edit.
- SMOOTH-WALKTHROUGH (COMPLETE) shares `walkthrough-announcement/`. B-W1 edits the same
  files it did; serialise, do not run concurrently.
- Shared resources no file list shows (`this-repo.md`): `npx tsc --noEmit` has one
  caller; no two agents sabotage on the tree at once; `docs/BACKLOG.md` belongs to the
  orchestrator.
- Exact-path intersection of this scope's full write set with the in-flight list above
  is EMPTY except `bulk-course-message/` (handled by the A29 serialisation) `[the
  orchestrator runs `sort mine inflight | uniq -d` before dispatch; this scope writes
  no code]`.

---

## 8. OPEN FORKS (each shaped so every answer terminates the activity)

I recommend and the wave plan proceeds on the recommended reading, recorded as MY
reading, not an owner ruling. Nothing is built; the plan is paper.

**T1 - WHICH announcement surfaces actually MOVE into the new tab.** This is the shape
decision with the largest blast-radius difference.
- (a) Move ALL FOUR (walkthrough, record-announcement, Canvas composer, bulk-message).
  Biggest grouping; but record-announcement is deep-coupled to RecordingTab's take
  library (section 3.1) - large, high-regression surgery.
- (b) Move three (walkthrough, Canvas composer, bulk-message); KEEP "Record
  announcement" in Recording with a cross-link into the new tab.
- (c) Move only the non-capture composition tools (Canvas composer, bulk-message) +
  walkthrough; drop record-announcement from scope entirely.
RECOMMENDED: **(b).** It groups everything the owner would call an "announcement tool,"
honours the fact that record-announcement is a RECORDING activity whose front door was
placed in Recording on purpose (`RecordingTab.tsx:46-47`, a code COMMENT, not a
ruling), and avoids the take-library surgery while still giving one reachable path to
it from the new tab. **Orchestrator check required (`traps-spec.md:109-129`): a code
comment is not an owner decision - before foreclosing the "move record-announcement"
branch, the orchestrator must check `docs/owner-decisions-*.md` for a decision on the
record-announcement placement. If one exists, it rules; if not, (b) proceeds.** Rework
if the owner picks (a) after build: the take-library re-parenting, ~1 wave.

**T2 - MOVE vs MIRROR the Canvas composer out of LMS.**
- (move) Remove `lms-announcements`/`contentView "announcements"` from LMS; the LMS
  cascade (section 3.2) runs; one home.
- (mirror) Keep the composer reachable under LMS too; `LMS_VIEW_PRESENCE` unchanged;
  two homes for one component.
RECOMMENDED: **move.** Mirroring leaves two chips named "Announcements" (the Tools-rail
chip and the LMS inner destination) pointing at the same tool - the discoverability
confusion the owner asked to end. The LMS cascade is bounded and its validator
(`validateLmsViewsCompleteness`) catches a half-done move. If the owner wants the
composer to stay discoverable from LMS, pick mirror and accept the double home.

**T3 - inner-nav grouping of the new tab.**
- Recommended: two inner chips - "Post an announcement" (Canvas composer + bulk-message
  below it, preserving the shipped `CanvasTab.tsx:11-12` pairing) and "From a
  walkthrough" (the walkthrough panel). A third "Record an announcement" appears only
  under T1=(a).
RECOMMENDED: as above. Alternative (one flat tab with all panels stacked, no inner nav)
is rejected: it stacks a ~760px capture panel above the composer and defeats the
scroll-minimisation the owner asked for in REQUEST 2.

**T4 - a dedicated container file vs an inline page.tsx branch.**
RECOMMENDED: a dedicated `AnnouncementsSubTab.tsx` for the non-capture tools (keeps
page.tsx growth small, 832 -> ~850) while the two capture surfaces stay as
always-mounted top-level siblings in page.tsx (they MUST, to survive a tab switch).
Alternative (all inline) grows page.tsx more for no benefit.

---

## 9. RESIDUAL REGISTER

Each entry names an owner, an instrument, and the step that measures it; missing any
of the three it is a deletion (`iteration-caps.md`). Residuals the orchestrator must
file in `docs/BACKLOG.md` are marked.

| ID | What is not proven now | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R-1 | Whether a decision on record-announcement's placement exists (T1 foreclosure) | orchestrator | `grep -a -rn "record.announcement\|take announcement" docs/owner-decisions-*.md` | before A-W2 dispatch; rules T1 |
| R-2 | The exact directory key canary that scans the new `ta-announcements-view` file (AC-R1-9) | the architect wave | identify which `*structure*`/`*Keys*` test scans the new file's dir | A-W2 design, before the key lands |
| R-3 | The felt nav (AC-R1-7) and the felt walkthrough flow at the new location (AC-R2-4) | repo owner | owner click-through on fresh + returning profiles | A-W3 owner check / B-W2 |
| R-4 | The leverage removal test (AC-R2-5) - no vitest here observes a click | repo owner | owner counts clicks | with R-3 |
| R-5 | The institution-picker chrome relocation (section 3.2) - which component renders the switcher after the composer moves | the A-W2 architect pass | open `ContentTab.tsx:10,76` and `announcements-panel.tsx`'s institution reads; decide switcher host | A-W2 design |
| R-6 | Whether moving `announcement` (record-announcement) breaks the shared recorder/take singletons (only relevant if T1=(a)) | the architect wave (filed to BACKLOG if T1=(a)) | trace `openAnnouncement`/`announcementTake`/`postedByTakeId` out of RecordingTab | A-W2 only if T1=(a) |
| R-7 | A29 (`bulk-course-message/`) landing before the bulk-message re-home | orchestrator (BACKLOG) | `git status --short` clean of `bulk-course-message/` | before A-W2 BUILD |
| R-8 | Whether the recording-split "restore chain" needs a mirror "walkannounce NOT accepted" guard (section 3.1) to catch a silent move-back | the test seat | pattern after `recording-split.structure.test.ts:187-191` | the test-notes step |
| R-9 | G3/G6/G7 walkthrough guards whose enforcing test the sibling scope marked `[UNDETERMINED]` still stand after the move | the test seat | `grep -rn` for the guards in `*.test.ts`, paired with a canary | the test-notes step |

**Disposition table: not applicable.** This is the first version of this scope, not a
restructure of a prior one. It is adjacent to - and does NOT restructure -
`docs/walkthrough-announcement-clicks-scope.md`, which is the (completed)
SMOOTH-WALKTHROUGH design.

---

## 10. What I opened, so a checker can re-walk it

`docs/DEV_LOOP.md`, `docs/loop/seats.md`, `docs/loop/leverage.md`,
`docs/loop/this-repo.md`, `docs/loop/traps-spec.md`, `docs/loop/iteration-caps.md`,
`docs/walkthrough-announcement-clicks-scope.md` (whole);
`docs/BACKLOG.md` (the two rows at `:198` and `:202`);
`src/app/page.tsx` (`:440-669`, `:669-832`),
`src/app/components/tabs/tab-sections.ts` (whole),
`src/app/components/tabs/tab-rails.ts` (whole),
`src/app/components/manual/manual-rail.ts` (whole),
`src/app/components/home/useAppNavigation.ts` (`:185-274`, plus key defs `:50,55,68`),
`src/app/url-state.ts` (grep for manualView/announcements),
`src/app/components/CanvasTab.tsx` (whole),
`src/app/components/ContentTab.tsx` (`:1-100` by grep),
`src/app/components/RecordingTab.tsx` (`:30-75`, `:160-300`, `:380-420`, `:490-540`,
`:585-640`, `:720-830`, `:870-881`),
`src/app/components/recording/recording-split.structure.test.ts` (`:117-191`),
`src/app/components/walkthrough-announcement/AnnouncementDraftSlot.tsx` (`:110-379`),
`src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx` (grep
for sticky/scroll/auto-draft),
`src/app/components/bulk-course-message/BulkCourseMessagePanel.tsx` (`:1-130`),
`src/app/components/tabs/tab-rails.test.ts` (grep for length pins),
`src/app/components/tabs/topLevelTabs.wiring.test.ts` (grep for length pins);
git: `git log` on the SMOOTH-WALKTHROUGH commits, `git diff --stat df2dff8d~1
494826ec -- src/app/components/walkthrough-announcement/`.

Not opened and therefore not claimed: `ManualRail.tsx` body (only its size and its
documented role as the inner-nav renderer), `announcements-panel.tsx` body beyond its
institution-chrome dependency, `useTakeAnnouncement.ts` body, the walkthrough
`*.test.ts` bodies (so R-9 guard-enforcer cells are `[UNDETERMINED]`), any rendered
pixel, any browser behaviour.
