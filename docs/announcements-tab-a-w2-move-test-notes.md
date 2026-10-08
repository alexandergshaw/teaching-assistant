# ANNOUNCEMENTS-TAB wave A-W2 (mount + move) - TDD test notes + oracle

Seat: `loop-test-author` (Opus). Authored 2026-10-04. NOT YET CHECKED by
`loop-checker`. This file is the only artifact; no production or test code was
written here. The implementer builds the tests from these notes.

Scope under test: **A-W2 fills the Announcements sub-tab shell (shipped empty by
A-W1, 25bcbfcb) by MOVING three existing surfaces into it.** A-W1 is confirmed
shipped: `manualView "announcements"` is registered (`manual-rail.ts:23,215,227`),
the empty `AnnouncementsSubTab.tsx` mounts inside `TabShell` at
`page.tsx:617-621`, the two inner chips (`post`/`walkthrough`) are wired
(`manual-rail.ts:74-87,164-169,256-262,315-317,429-433`), the inner-view key
`ta-announcements-view` persists (`useAppNavigation.ts:62,469-473,581-582`), and
the rail length pins are already at 12 (`tab-rails.test.ts:68`,
`topLevelTabs.wiring.test.ts:377`).

### Evidence tags
- `[MEASURED <cmd>]` the command was run in this checkout, output quoted/used.
- `[READ file:line]` I opened that file at that line.
- `[ARGUED]` reasoned from READ facts; the runtime was not observed.
- `[UNDETERMINED]` I could not settle it here and say so.

### What I could NOT do (stated once, per `docs/loop/this-repo.md` section 6)
Nothing renders under vitest (node-env, network-blocked `vitest.setup.ts`). I
could not click a chip, observe a reload, see a panel appear/disappear, or watch
a live screen-capture survive a tab switch. **Every instrument below is a
pure-registry / source-text / structure pin, never a rendered-component test.**
Movement correctness that only a browser can show is named an OWNER residual
(section 8), never faked green.

---

## 0. THE RULINGS (fixed by the orchestrator; I do NOT re-decide them)

- **T1 = MOVE (not mirror)** three surfaces INTO the Announcements tab:
  1. the walkthrough-announcement panel (`WalkthroughAnnouncementPanel.tsx`,
     today in Recording),
  2. the Canvas announcement composer (`canvas-tab/announcements-panel.tsx`
     default export `AnnouncementsPanel`, today in LMS),
  3. the A29 bulk-course-message tool
     (`bulk-course-message/BulkCourseMessagePanel.tsx`, today in LMS).
  **KEEP record-announcement in Recording** with a cross-link to the new tab; do
  NOT re-parent the take library.
- **T3 = two inner chips.** `post` = composer + bulk-message; `walkthrough` = the
  walkthrough capture panel. (Already registered by A-W1 as
  `announcements-post` / `announcements-walkthrough`.)
- **T4 = the non-capture tools live in `AnnouncementsSubTab.tsx`; the walkthrough
  CAPTURE panel stays an ALWAYS-MOUNTED top-level sibling in `page.tsx`.** The
  `walkthrough` chip SELECTS/REVEALS the already-mounted capture panel via a
  `display` toggle; it does NOT conditionally mount it.

"MOVE (not mirror)" is read, per the scope's T2 recommendation
(`docs/announcements-tab-and-walkthrough-scope.md:390-399`), as: the composer and
bulk tool LEAVE LMS entirely (the LMS `announcements` view is removed, not kept
as a second home). **This triggers the full LMS cascade of section 3, which is
materially larger than the A-W2 write set named in the scope's section 6 - see
section 7, which is this seat's single most important finding.**

---

## 1. THE MOVE, AS THREE RELOCATIONS (grounded in the tree)

| # | Surface | Component / mount TODAY | Lands | Capture? |
|---|---|---|---|---|
| M1 | Walkthrough announcement | `WalkthroughAnnouncementPanel` imported `RecordingTab.tsx:32`, mounted `:879-880` as `active={active && recView === "walkannounce"}`; strip tuple `:596`; `recView` union member `:61`; restore chain `:66-74` | an **always-mounted display-toggled sibling in `page.tsx`**, guard `manualView==="announcements" && announcementsView==="walkthrough"` | YES (`useDiscussionCapture`, screen share) |
| M2a | Canvas composer | `<AnnouncementsPanel/>` mounted ONLY at `CanvasTab.tsx:16` `[MEASURED grep -rn "<AnnouncementsPanel"]` | inside `AnnouncementsSubTab.tsx`, shown for the `post` chip | NO |
| M2b | Bulk course message (A29) | `<BulkCourseMessagePanel/>` mounted ONLY at `CanvasTab.tsx:17` `[MEASURED]` | inside `AnnouncementsSubTab.tsx`, below the composer, for the `post` chip | NO |
| KEEP | Record announcement | `<TakeAnnouncementPanel/>` mounted ONLY at `RecordingTab.tsx:817` `[MEASURED]` | STAYS; gains a cross-link to the Announcements tab | YES (stays) |

**A29 is at HEAD, not in-flight.** `[MEASURED git ls-files src/app/components/bulk-course-message/]`
returns all six files tracked; `[MEASURED git status --short]` shows no
`bulk-course-message/` entry. **R-7 of the scope is DISCHARGED: the A29
serialisation gate no longer blocks A-W2.** (Scope section 2/7 described A29 as
untracked; that has changed since the scope was authored. Verified here.)

File sizes `[MEASURED wc -l]`, headroom to the 1000-line ceiling:
`page.tsx` 841 (+walkthrough sibling ~12 -> ~853), `RecordingTab.tsx` 909
(shrinks when M1 leaves), `ContentTab.tsx` 891 (shrinks when the LMS
announcements branch leaves), `AnnouncementsSubTab.tsx` 18 (grows by the
composer+bulk import/mount, staying tiny - the component FILES do not move into
it, only the mount). No file crosses 1000.

---

## 2. CANARY INVENTORY - EVERY frozen-set / count gate the moves trip

This is the structural-move rule (`[[gate-must-include-directory-canary]]`,
`docs/loop/traps-tests.md` "Every count assertion needs a demonstrated failure
mode"). Each row: the gate, what it pins, its `file:line`, the before->after, and
who bumps it. **Every one of these must be edited in the SAME commit as the
source change it tracks, and BOTH the A-W2 build gate AND the A-W3 verify gate
must run every file listed here.** A move that passes only the gates the wave
happened to run is exactly how this repo ships red-and-silent
(`[[gate-must-include-directory-canary]]`: repo-grader left main red through
build and verify).

### 2A. Recording cascade (M1: `walkannounce` leaves RecordingTab)

| Gate | Pins | file:line | Before -> After |
|---|---|---|---|
| strip exact-count | "exactly ten inner-view tabs" via `\["[a-z]+",...]` on the `["record","Record"]` line | `recording-split.structure.test.ts:141-147` `[READ]` | 10 -> **9**; drop the `["walkannounce", ...]` tuple at `RecordingTab.tsx:596` |
| tabpanel count | `role="tabpanel"` occurrences === 9 | `:206-208` `[READ]` | 9 -> **8**; drop the walkannounce panel div `RecordingTab.tsx:879-881` |
| aria-controls keys | the 10-key array + `panelTargets.size === 9` | `:219-238` (`keys` array `:223-234`, size assert `:238`) `[READ]` | drop `"walkannounce"` from the array; size 9 -> **8** |
| recView union | the `"record" \| ... \| "walkannounce" \| ...` literal | `RecordingTab.tsx:61` `[READ]` | drop `"walkannounce"` |
| recView restore chain | `v === "walkannounce"` in the localStorage initializer | `RecordingTab.tsx:66-74` `[READ]` | drop `v === "walkannounce"` |
| launch handler guard | `setRecView(detail.view)` after an early-return guard list | `RecordingTab.tsx:108` `[READ]` | add `|| detail.view === "walkannounce"` to the guard (else `setRecView("walkannounce")` fails tsc once the union shrinks - the exact GRAD-SUBTAB precedent, `:108` already guards `grading`/`snapgrade`/`remembered`) |

**The restore-guard structure test at `recording-split.structure.test.ts:174-181`
does NOT list `walkannounce`** `[READ]` (it checks
discussions/speed/captions/slides/avatar/announcement/messages only), so removing
`v === "walkannounce"` from the chain trips NO existing assertion. That silence is
the R-8 hazard: see requirement REQ-7 for the mirror "NOT accepted" guard the
move must ADD.

### 2B. walkthrough-announcement structure test - THE MOUNT BLOCK INVERTS

`walkthrough-announcement.structure.test.ts` has a whole block
**"WalkthroughAnnouncementPanel is actually mounted by RecordingTab"**
(`:36-95`) that pins the panel INSIDE RecordingTab. The move inverts every
assertion; this file **must be rewritten in the same commit** (it is NOT in the
scope's section-6 write set - gap, section 7):

| Assertion | file:line | After the move |
|---|---|---|
| RecordingTab imports the panel | `:37-41` `[READ]` | now **`page.tsx`** imports it; retarget the read to `page.tsx` |
| RecordingTab renders `<WalkthroughAnnouncementPanel` | `:43-45` | now in `page.tsx` |
| receives `active={active && recView === "walkannounce"}` | `:47-49` | new guard shape (REQ-2); retarget |
| `walkannounce` is in the recView union | `:52-63` | **REMOVE** (gone from recView) |
| `walkannounce` is in the restore guard chain | `:65-72` | **REMOVE** |
| strip has a walkannounce entry | `:74-76` | **REMOVE** |
| `recording-launch` `RecordingLaunchView` carries walkannounce | `:79-95` | **KEEP** - walkannounce stays a valid LAUNCH view (fab/Knowledge entry); only its ROUTE changes (REQ-8) |

### 2C. LMS cascade (M2a/M2b: composer + bulk leave LMS)

| Gate | Pins | file:line | After the move |
|---|---|---|---|
| ContentView type | `"announcements"` is a member | `content-tab/constants.ts:3` `[READ]` | **remove `"announcements"`** [write-set GAP] |
| LMS_VIEW_PRESENCE | exhaustive record incl. `announcements:true` | `manual-rail.ts:105-113` `[READ]` | remove `announcements` |
| destinations | `{id:"lms-announcements",...}` | `manual-rail.ts:135` `[READ]` | remove |
| resolveStateFromDestinationId | `if (id==="lms-announcements") return "announcements"` | `manual-rail.ts:408` `[READ]` | remove (getActiveDestinationId needs no edit - it is the derived template ``lms-${contentView}`` `:302`) |
| manual-rail.test: getDestinationById | `getDestinationById("lms-announcements").toBeDefined()` | `manual-rail.test.ts:38` `[READ]` | **flip to a retired block** (`.toBeUndefined()`), mirroring `:495-501` [write-set GAP] |
| manual-rail.test: resolve lms-announcements | resolves to content+announcements | `manual-rail.test.ts:118-122` | remove/retire |
| manual-rail.test: LMS_VIEWS equals | literal list incl. `"announcements"` | `manual-rail.test.ts:148` | remove `"announcements"` |
| manual-rail.test: getInnerDestinations content | literal list incl. `"lms-announcements"` | `manual-rail.test.ts:240-248` | remove |
| manual-rail.test: derived LMS loops | loops `LMS_VIEWS` | `manual-rail.test.ts:326-338` | auto-adjusts (no edit) |
| validateLmsViewsCompleteness | returns no errors iff both sides agree | `manual-rail.ts:438-458`, test `manual-rail.test.ts:142-145` `[READ]` | **stays green only if LMS_VIEWS and destinations drop `announcements` together** - this is the consistency instrument, REQ-9 |
| contentTab.wiring anchor | `extractRenderChain` indexOf `'view === "announcements" ? ('` | `contentTab.wiring.test.ts:57` `[READ]` | **SLICE -1 TRAP**: returns -1 and THROWS the whole describe once the branch is removed; **re-anchor on `'view === "inbox" ? ('`** (the new first branch) [write-set GAP] |
| contentTab.wiring SELF_HOSTING | `Set(["announcements","inbox"])` | `contentTab.wiring.test.ts:43` `[READ]` | drop `"announcements"` -> `["inbox"]` |
| contentTab.wiring counts | `LMS_VIEWS.length===7`, `courseTabEligible.length===5` | `contentTab.wiring.test.ts:79-81` `[READ]` | 7 -> **6**; courseTabEligible stays 5 |
| ContentTab render branch | `view === "announcements" ? (announcements) :` | `ContentTab.tsx:770` `[READ]` | remove the branch; `inbox` becomes first |
| ContentTab prop | the `announcements` prop in ContentTab's signature | `ContentTab.tsx` (~`:67,:73` per `docs/tools-grading-subtab-architecture.md:426`) | remove |
| page.tsx ContentTab prop | `announcements={<CanvasTab view="announcements" />}` | `page.tsx:593` `[READ]` | remove |
| CanvasTab | `view==="announcements"` branch mounting both panels | `CanvasTab.tsx:14-18` `[READ]` | becomes inbox-only (the two panel imports `:3,:5` and the branch are removed) |

**The TOOLS_RAIL chip count (12) is NOT tripped by the LMS move.** `TOOLS_RAIL_ITEMS`
derives from `MANUAL_VIEW_ORDER.length + WORKFLOWS_VIEW_ORDER.length`
(`tab-rails.test.ts:93`); `lms-announcements` is an INNER destination, not a rail
chip. `[ARGUED from READ tab-rails.test.ts:93]` Confirmed no edit to the 12-count
pins.

### 2D. Directory key canaries - MEASURED, mostly NOT tripped

- `componentStorageKeys.structure.test.ts` scans **only files directly in
  `src/app/components/`, non-recursive** (`:103-108`, frozen set of 81 keys
  `:132-214`) `[READ]`. A-W2 adds no `ta-` key to a top-level component file, and
  `ta-announcements-view` already lives in the `home/` subdirectory
  (`useAppNavigation.ts:62`), which this canary does not scan. **Not tripped.**
  `[ARGUED]`
- `walkthrough-announcement.structure.test.ts:118-125` freezes **6** `ta-rec-wta-*`
  keys in the `walkthrough-announcement/` directory `[READ]`. M1 moves the panel's
  MOUNT, not its files - the directory roster is unchanged. **Not tripped.**
- `recording-split.structure.test.ts:352-427` freezes the `ta-rec-*` key set
  `[READ]`. Its scan is `recording/` dir + `RecordingTab.tsx`. `walkannounce` is
  NOT a `ta-rec-*` key; the walkthrough panel lives in `walkthrough-announcement/`
  (not scanned). **Not tripped** - but verify by running it (REQ-10), because
  removing the walkthrough import line from RecordingTab.tsx could in principle
  remove a `ta-rec-*` string if one rode on that line; `[READ RecordingTab.tsx:32]`
  confirms line 32 is a bare import, no key. `[ARGUED]`
- **`ta-announcements-view` = DISCHARGED by A-W1.** The key already exists and
  passed A-W1's gates; A-W2 adds no key. Scope residual R-2 is closed by
  measurement. `[MEASURED grep -n ta-announcements-view useAppNavigation.ts -> :62]`
- **`components/announcements/` has NO directory `ta-`/basename canary today**
  `[MEASURED grep -rln "readdirSync\|frozen\|basename" src/app/components/announcements --include=*.test.ts -> no match]`. If A-W2 adds NEW files to that
  directory (e.g. a split-out post surface), nothing catches a stray key there.
  This is a reading-claim gap, recorded as residual R-11, not a blocker.

---

## 3. NUMBERED REQUIREMENTS - object, instrument, direction, sabotage

`MACHINE` = a pure/source-text/structure test pins it. `OWNER` = only a browser
shows it. Every pass condition names the object under comparison, the instrument,
and the DIRECTION of failure (`docs/loop/traps-spec.md`). Each requirement gets a
named sabotage with its expected colour and whether it DISCRIMINATES.

Run multi-file sets with `npm run test:paths <p1> <p2> ...`, NEVER a raw
multi-path `vitest`/`npm test` (it silently drops unmatched args -
`[[test-paths-wrapper]]`, `docs/loop/traps-tests.md`).

### REQ-1 (MACHINE) - the two LMS panels have exactly ONE mount site each, and it is NOT CanvasTab

- Object: every `<AnnouncementsPanel` and `<BulkCourseMessagePanel` render site in
  production `*.tsx`.
- Instrument: a source scan (new or extended structure test) asserting each tag
  appears in EXACTLY ONE production render site (model on `assertAlwaysMounted`'s
  "exactly one render site" check, `topLevelTabs.wiring.test.ts:529-531`), and
  that site is `AnnouncementsSubTab.tsx`, and NOT `CanvasTab.tsx`.
- Direction: RED if either tag appears in two sites (double mount) OR still appears
  in `CanvasTab.tsx` OR appears zero times (lost).
- Baseline `[MEASURED grep -rn "<AnnouncementsPanel\|<BulkCourseMessagePanel" src --include=*.tsx | grep -v .test.]`: today BOTH are only at `CanvasTab.tsx:16,17`.
- **Sabotage A (double mount - the named failure):** leave `<BulkCourseMessagePanel/>`
  in `CanvasTab.tsx` AND add it to `AnnouncementsSubTab.tsx`. Expect RED (two
  sites). DISCRIMINATES.
- **Sabotage B (not moved):** add the composer to `AnnouncementsSubTab` but do not
  remove it from CanvasTab. Expect RED (still in CanvasTab). DISCRIMINATES.

### REQ-2 (MACHINE) - the walkthrough panel is an always-mounted sibling in page.tsx, display-toggled on the announcements/walkthrough guard, NOT conditionally mounted

- Object: the `<WalkthroughAnnouncementPanel` render site in `page.tsx`.
- Instrument: a new `assertAlwaysMounted("WalkthroughAnnouncementPanel", [...])`
  case, IDENTICAL in shape to the GradingRecordingPanel case
  (`topLevelTabs.wiring.test.ts:524-560`). Guard terms:
  `activeTab === "manual"`, `toolsSection === "manual"`,
  `manualView === "announcements"`, `announcementsView === "walkthrough"`. The
  helper's regex (`:543-544`) proves the element IMMEDIATELY wrapping the panel
  sets `display` to `"none"` on the else arm - a conditional render
  (`{guard && <Panel/>}`) cannot satisfy it, which is the T4 proof.
- Direction: RED if the panel is wrapped in `manualView === "announcements" && ...`
  as a conditional render (the exact T4-forbidden shape), OR has two render sites,
  OR its wrapper guard omits any of the four terms.
- **Sabotage C (conditional mount = lost live stream):** change the sibling from a
  `<div style={{display: ... ? undefined : "none"}}><WalkthroughAnnouncementPanel/></div>`
  to `{manualView === "announcements" && announcementsView === "walkthrough" && <WalkthroughAnnouncementPanel/>}`.
  Expect RED on the display-toggle regex. DISCRIMINATES. This is precisely the
  mutation `topLevelTabs.wiring.test.ts:518-522` already proves catchable for the
  grading panels.

### REQ-3 (MACHINE) - the walkthrough panel is REMOVED from the recording strip and every recording canary is bumped consistently

- Object: `RecordingTab.tsx` + `recording-split.structure.test.ts`.
- Instrument: the recording-split canaries of section 2A, run as a set.
- Direction: RED if any count is stale (strip != 9, tabpanels != 8,
  `panelTargets.size` != 8), or the recView union/restore chain still carries
  `walkannounce`, or the launch guard omits it.
- **Sabotage D (half-done move):** drop the strip tuple and the panel div but LEAVE
  `"walkannounce"` in the recView union. Expect tsc RED
  (`setRecView(detail.view)` path) and the union-member rewrite in
  `walkthrough-announcement.structure.test.ts:52-63` must have been removed or it
  goes RED. DISCRIMINATES.
- **Sabotage E (count not bumped):** remove the panel div but leave the tabpanel
  canary at 9. Expect RED at `:208`. DISCRIMINATES.

### REQ-4 (MACHINE) - the frozen inner-chip -> surface oracle

The chip->surface mapping is the thing the owner's grouping IS. There is a PURE
layer and a SURFACE layer; both are pinned.

**Pure layer (already green, keep it green):** `resolveStateFromDestinationId`
maps `"announcements-post" -> announcementsView "post"` and
`"announcements-walkthrough" -> "walkthrough"` (`manual-rail.test.ts:648-664`
`[READ]`, derived over `ANNOUNCEMENTS_VIEWS`). A-W2 must not regress this.

**Surface layer (new, the actual mapping):** a frozen table pinned by source-text
over `page.tsx` + `AnnouncementsSubTab.tsx`, each anchor resolving at BOTH ends
(the slice rule, `docs/loop/traps-tests.md`):

| Chip (`announcementsView`) | Surface shown | Mount site | Guard term that gates it |
|---|---|---|---|
| `post` | `AnnouncementsPanel` + `BulkCourseMessagePanel` | `AnnouncementsSubTab.tsx` inside the `page.tsx:617` TabShell branch | the TabShell branch guard carries `announcementsView === "post"` (REQ-5) |
| `walkthrough` | `WalkthroughAnnouncementPanel` | always-mounted sibling in `page.tsx` | sibling wrapper carries `announcementsView === "walkthrough"` (REQ-2) |

- Direction: RED if the walkthrough sibling's guard names `"post"`, or the
  post-surface branch names `"walkthrough"`, or either surface is reachable under
  the other chip's guard.
- **Sabotage F (walkthrough chip wired to composer - the named failure):** set the
  always-mounted sibling's guard to `announcementsView === "post"`. Expect RED
  (REQ-2 guard-term check fails: `"walkthrough"` absent). DISCRIMINATES.
- **Sabotage G (chips swapped):** swap the two guard terms. Expect RED on both the
  REQ-2 term list and the REQ-5 branch gate. DISCRIMINATES.

### REQ-5 (MACHINE) - the post surface does NOT double-mount against the walkthrough sibling (the grading R-1 analog)

- Object: the `page.tsx` TabShell branch that renders `<AnnouncementsSubTab`.
- Problem: today `page.tsx:617` renders `AnnouncementsSubTab` for ALL of
  `manualView === "announcements"`, unconditioned on `announcementsView`. Once the
  walkthrough sibling is always-mounted and shown for `walkthrough`, an
  unconditioned `AnnouncementsSubTab` would ALSO be on screen for `walkthrough` -
  two surfaces for one chip. This is the identical hazard the grading branch
  solved by gating to `run`/`repos` (`page.tsx:636`, guarded by
  `topLevelTabs.wiring.test.ts:593-610`).
- Instrument: a source pin, modelled on `topLevelTabs.wiring.test.ts:593-610`, that
  the `AnnouncementsSubTab` TabShell branch guard is scoped to
  `announcementsView === "post"` (so it does not paint for `walkthrough`).
  Recommended reading: gate the branch; `AnnouncementsSubTab` then only ever mounts
  for `post`. (Alternative: `AnnouncementsSubTab` internally renders nothing for
  `walkthrough` - weaker, because the shell header would still paint. The gate is
  the clean mirror of the shipped grading precedent; I recommend it.)
- Direction: RED if `<AnnouncementsSubTab` can render while
  `announcementsView === "walkthrough"`.
- **Sabotage H (double surface):** remove the `announcementsView === "post"` clause
  from the branch guard. Expect RED. DISCRIMINATES. (This is the exact mutation
  proven catchable at `topLevelTabs.wiring.test.ts:590-592` for grading.)
- NOTE: the `topLevelTabs.wiring.test.ts:334-345` loop requires a
  `manualView === "announcements"` branch for every `MANUAL_VIEW_ORDER` member; a
  branch gated `manualView === "announcements" && announcementsView === "post"`
  still contains that substring, so the loop stays green. `[ARGUED from READ :338-343]`

### REQ-6 (MACHINE) - record-announcement is NOT re-parented, and gains a cross-link whose target resolves to manualView "announcements"

- Object: `<TakeAnnouncementPanel` mount location, and the cross-link's navigation
  target.
- Instrument (not-reparented half): source pin that `<TakeAnnouncementPanel`
  appears in `RecordingTab.tsx` and NOT in `AnnouncementsSubTab.tsx` or the
  `page.tsx` announcements branch. Baseline `[MEASURED]`: only `RecordingTab.tsx:817`.
- Instrument (cross-link half): the cross-link control must navigate through a PURE
  seam (no component renders here), so pin the FACT at that seam. Recommended
  reading: a leaf nav helper modelled on `src/lib/drafts-nav.ts`
  (`openMessageDrafts()` dispatches `MESSAGE_DRAFTS_NAV_EVENT`, page.tsx listens and
  sets state) - add `openAnnouncementsTab()` dispatching a new event, and a
  `page.tsx` listener that calls `setManualView("announcements")` (and
  `setAnnouncementsView("post")`). Pin: (a) the helper's dispatched target is
  announcements (a unit assertion on a pure resolver or the helper's documented
  constant), and (b) `page.tsx`'s listener body contains
  `setManualView("announcements")`.
- Direction: RED if `TakeAnnouncementPanel` moved out of RecordingTab, or the
  cross-link's resolved target is any manualView other than `"announcements"`.
- **Sabotage I (accidental re-parent - the named failure):** move
  `<TakeAnnouncementPanel` into `AnnouncementsSubTab`. Expect RED (present in
  AnnouncementsSubTab / absent from RecordingTab). DISCRIMINATES.
- **Sabotage J (cross-link points at the wrong tab):** set the listener to
  `setManualView("recording")`. Expect RED. DISCRIMINATES.
- CAVEAT: a source pin proves the listener CONTAINS the setter call; it cannot
  prove the click reaches the listener or the tab actually changes (no render). The
  end-to-end nav is OWNER (R-3). Do NOT claim the source pin verifies the jump.

### REQ-7 (MACHINE) - a mirror "walkannounce NOT accepted" guard is ADDED to the recording restore surface

- Object: the `recView` restore guard chain in `RecordingTab.tsx:66-74`.
- Why: section 2A shows that removing `v === "walkannounce"` from the chain trips
  no existing assertion (the structure test at `recording-split.structure.test.ts:174-181`
  never listed it). Without a positive "NOT accepted" guard, a later regression that
  re-adds `walkannounce` to the chain (a silent sign the panel moved back into
  Recording) goes uncaught - the exact shape of the grading/snapgrade guard at
  `recording-split.structure.test.ts:187-193` `[READ]`.
- Instrument: add, next to that grading guard, an assertion that the restore chain
  does NOT contain `v === "walkannounce"` (and the `walkthrough-announcement.structure.test.ts`
  recView/restore assertions `:52-72` are DELETED, not left to rot green-or-absent).
- Direction: RED if the restore chain re-accepts `walkannounce`.
- **Sabotage K (silent move-back):** re-add `v === "walkannounce"` to the chain.
  Expect RED on the new guard. DISCRIMINATES. (This discharges scope residual R-8.)

### REQ-8 (MACHINE) - the walkannounce LAUNCH route retargets to the Announcements tab

- Object: `resolveRecordingLaunchRoute` (`recording-launch.ts:92-105`) and its
  page.tsx consumer (`page.tsx:159-161`).
- Why: `walkannounce` stays a valid `RecordingLaunchView`
  (`recording-launch.ts:67,82`, fab/Knowledge entry). Today
  `resolveRecordingLaunchRoute("walkannounce")` falls into the else arm returning
  `{manualView:"recording"}` `[READ :104]` - after the move that lands the user on
  Recording, where the panel NO LONGER IS: a dead launch. The resolver must return
  `manualView: "announcements"` with `announcementsView: "walkthrough"`, mirroring
  how grading/snapgrade were retargeted (`:98-103`).
- Instrument: a unit test (the pure resolver IS testable without rendering - drive
  the production path `resolveRecordingLaunchRoute`, do not import an internal,
  per the seat's practice #3) asserting
  `resolveRecordingLaunchRoute("walkannounce")` returns `manualView "announcements"`
  and `announcementsView "walkthrough"`; plus a source pin that `page.tsx`'s listener
  consumes `route.announcementsView` (its return type must widen to carry it).
- Direction: RED if the walkannounce route still returns `"recording"`, or page.tsx
  ignores the announcementsView field.
- **Sabotage L (dead launch):** leave the resolver unchanged (walkannounce falls to
  the recording else arm). Expect RED. DISCRIMINATES.
- NOTE: whether the fab/Knowledge actually re-navigates is OWNER-observable only
  (R-3); the resolver unit test proves the pure decision, which is the faithful seam.

### REQ-9 (MACHINE) - LMS completeness stays internally consistent after the composer leaves

- Object: `LMS_VIEWS` vs the `lms-*` rail destinations.
- Instrument: `validateLmsViewsCompleteness()` returns `[]`
  (`manual-rail.test.ts:142-145` `[READ]`). This is a CONSTRUCTION-level consistency
  check: it errors if `announcements` is dropped from one side but not the other.
- Direction: RED (non-empty errors) if `LMS_VIEWS` still lists `announcements`
  while the destination is gone, or vice versa.
- **Sabotage M (half-done LMS removal):** remove the `lms-announcements` destination
  (`manual-rail.ts:135`) but LEAVE `announcements:true` in `LMS_VIEW_PRESENCE`.
  Expect RED: validator reports `LMS view "announcements" is missing from the rail
  destinations`. DISCRIMINATES. This is the single strongest LMS-move instrument -
  it is a derived consistency check, not a hand-list.

### REQ-10 (MACHINE) - no regression in the untouched recording/LMS gates; nothing over 1000 lines

- Object: the full touched set.
- Instrument: `npm run test:paths src/app/components/recording/recording-split.structure.test.ts src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts src/app/components/manual/manual-rail.test.ts src/app/components/contentTab.wiring.test.ts src/app/components/canvas-tab/announcements-panel.wiring.test.ts src/app/components/bulk-course-message/bulk-course-message.wiring.test.ts src/lib/recording-launch.test.ts src/app/components/tabs/tab-rails.test.ts src/app/components/tabs/topLevelTabs.wiring.test.ts src/app/components/componentStorageKeys.structure.test.ts`
  plus `npx tsc --noEmit` (one caller at a time) plus the repo file-size ceiling
  (`src/file-size-ceiling.structure.test.ts`). This command lists the six of
  section 7's seven files that are vitest tests (the seventh,
  `content-tab/constants.ts`, is source, caught by `tsc --noEmit` above) plus the
  standing rail/key canaries - the complete set lines ~90/~536 promise both gates
  run.
- Direction: RED if any gate fails or any touched file exceeds 1000 lines
  (`[MEASURED wc -l]`: all touched files <= 909 today).
- This is the "both gates run everything" clause of section 2.

### REQ-11 (OWNER + MACHINE half) - reload restores the sub-tab and inner selection; stale LMS-announcements does not strand the user

- Object: `ta-manual-view`, `ta-announcements-view`, and a stale
  `ta-content-view === "announcements"`.
- MACHINE half: `isManualViewType("announcements")` is `true`
  (`manual-rail.test.ts:226-229` `[READ]`, derived); `isAnnouncementsView`
  accepts post/walkthrough (`:263-267`). **Stale `contentView="announcements"`:**
  `normalizeContentView` derives its accepted set from `LMS_VIEWS`
  (`useAppNavigation.ts:303-336` `[READ]`), so once `announcements` leaves
  `LMS_VIEWS` the stored value auto-normalizes to the default LMS view - NOT a dead
  view, so no crash. A REDIRECT to the new Announcements tab (recommended, the
  course-intel/live-class/grading precedent at `manual-rail.ts:333-353`,
  `RETIRED_GRADING_POINTERS`) is a UX nicety, not a crash-fix. Recommended reading:
  add a retired pointer `content-view:announcements -> {manualView:"announcements",
  announcementsView:"post"}` and pin it with a derived-guard test like
  `:494-524`; if the orchestrator declines the redirect, record that a returning
  LMS>Announcements user lands on LMS>Modules (documented, not silent).
- OWNER half: reload actually restoring the chosen sub-tab + inner view - R-3.
- Direction (MACHINE): RED if `isManualViewType`/`isAnnouncementsView` reject the
  new values, or a stale `announcements` contentView resolves onto a DEAD view.
- **Sabotage N (stale value strands):** were `announcements` left in the
  `ContentView` type but removed from the render branch, `normalizeContentView`
  would still accept it and the user would land on a blank LMS pane. The instrument
  that catches this is `contentTab.wiring.test.ts:102-110` (every `LMS_VIEWS` member
  has a render branch) - so the move must drop `announcements` from `ContentView`
  AND `LMS_VIEWS` together. DISCRIMINATES via REQ-9 + the wiring loop.

---

## 4. FROZEN ORACLES (stated as CONSTRUCTIONS, with their provenance)

An oracle you cannot construct from the tree is not a requirement
(`docs/loop/seats.md` Test seat). Each here is constructible:

1. **Inner-chip -> surface table (REQ-4).** Built from TWO independent sources so
   no branch is unfalsifiable: the axis `{post, walkthrough}` comes from
   `ANNOUNCEMENTS_VIEWS` (`manual-rail.ts:80-82`, a presence-record-derived list),
   and the surface mapping comes from the `page.tsx` source slices. They are
   different sources (registry vs component source), satisfying "the axes must come
   from a different source than the generator" (`docs/loop/seats.md`).
2. **Single-mount oracle (REQ-1).** Constructed as "count of production render
   sites === 1, per panel tag", not a denylist of bad locations - the bad state
   (two mounts) is made unrepresentable by an equality on a COUNT, the
   `assertAlwaysMounted` construction (`topLevelTabs.wiring.test.ts:529-531`).
3. **LMS consistency oracle (REQ-9).** `validateLmsViewsCompleteness` is a derived
   cross-check over `LMS_VIEWS` x destinations - a construction, not an enumeration.
4. **Launch-route oracle (REQ-8).** A pure function with a finite input domain
   (`RECORDING_LAUNCH_VIEWS`); the walkannounce case is one row of an exhaustive
   per-view table the implementer can loop (do not hand-write one case).

I did NOT invent a frozen literal of the entire `page.tsx` announcements region:
that would be a source-text over-specification forcing contorted code
(`[[source-text-tests-overspecify]]`). The oracles pin the FACT and the ORDERING
(mount site, guard term, count), never the spelling - except where the spelling
IS the fact (a guard-term substring, a key literal).

---

## 5. REFERENCE-IMPLEMENTATION / SATISFIABILITY (proof the red set is buildable)

I cannot run code here, so satisfiability is proven **by an already-shipped,
isomorphic green implementation** rather than a throwaway tree:

- M1 (capture panel out of a tab -> always-mounted page.tsx sibling) is EXACTLY
  GRAD-SUBTAB wave 2, which shipped green: `GradingRecordingPanel` /
  `SnapshotGradingPanel` moved out of RecordingTab to page.tsx siblings, with the
  identical `assertAlwaysMounted` pins (`topLevelTabs.wiring.test.ts:523-584`), the
  identical recView-shrink + launch-guard edits
  (`RecordingTab.tsx:54-59,108`), and the identical strip/tabpanel count bumps
  (`recording-split.structure.test.ts:137-157`). An implementation satisfying
  REQ-2/3/5/7/8 therefore demonstrably exists.
- M2 (a view removed from the LMS registry with the cascade) is EXACTLY the
  course-intel / live-class / lms-grading removals, all shipped green
  (`manual-rail.test.ts:489-602` `[READ]`). An implementation satisfying
  REQ-9/11 demonstrably exists.
- REQ-6 cross-link is EXACTLY `openMessageDrafts` / `MESSAGE_DRAFTS_NAV_EVENT`
  (`drafts-nav.ts`, listener `page.tsx:198-212`), shipped green.

**Every red pin in section 3 has a green precedent pin that an identical edit
satisfied.** No pin asks for a state no shipped implementation has reached. If the
checker disputes any single pin's satisfiability, the named precedent is the place
to disprove it.

---

## 6. EXECUTABLE HERE vs ARGUED-ONLY (never conflated)

**Executable (a vitest/tsc instrument settles it):** REQ-1, REQ-2, REQ-3, REQ-4
(both layers), REQ-5, REQ-6 (source-pin half only), REQ-7, REQ-8 (resolver unit +
page source-pin), REQ-9, REQ-10, REQ-11 (MACHINE half).

**ARGUED / reading-claim only (labelled as such, NOT asserted verified):**
- that the live screen-capture actually survives a tab switch (the whole reason M1
  is always-mounted) - no component renders; the display-toggle regex is a PROXY
  for the mechanism, never the behaviour. OWNER, R-3.
- that clicking the `walkthrough` chip makes the capture panel appear and the
  `post` chip makes the composer appear - OWNER, R-3.
- that the cross-link click actually lands on the Announcements tab - OWNER, R-3.
- that the fab/Knowledge `walkannounce` launch actually navigates post-move -
  OWNER, R-3 (the resolver unit test proves only the pure decision).
- that the institution switcher is reachable from the new tab (section 7, R-5).

---

## 7. THE LMS-MOVE WRITE-SET GAP (this seat's top finding for the checker)

The scope's A-W2 write set (`docs/announcements-tab-and-walkthrough-scope.md:320`)
lists `page.tsx`, `AnnouncementsSubTab.tsx`, `RecordingTab.tsx` +
`recording-split.structure.test.ts`, `CanvasTab.tsx`, `ContentTab.tsx`, "LMS
validator edits in `manual-rail.ts`", `useAppNavigation.ts`, and "the directory
key canary". **The MOVE-out-of-LMS ruling forces edits to files that write set
does NOT name. Each is a canary an instrument above depends on; omitting it ships
red-and-silent or dead.** Required in the A-W2 commit (SEVEN files: six require
EDITS; the seventh, `announcements-panel.wiring.test.ts`, needs no edit, only to
stay green in the gate):

| Forced file | Why the move requires it | Instrument it carries |
|---|---|---|
| `src/app/components/content-tab/constants.ts` | `ContentView` must drop `"announcements"` (`:3`) or the type still admits a view with no home | feeds `normalizeContentView`, `LMS_VIEWS` |
| `src/app/components/manual/manual-rail.test.ts` | pins `lms-announcements` defined (`:38`), the LMS_VIEWS literal (`:148`), the inner-destinations literal (`:240-248`), the resolve case (`:118-122`) | all must be retired/updated or they go RED |
| `src/app/components/contentTab.wiring.test.ts` | the `extractRenderChain` anchor (`:57`) THROWS at -1 when the branch is removed (slice -1 trap); `SELF_HOSTING_VIEWS` (`:43`) and the count (`:79`) move | the render-branch completeness loop |
| `src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts` | **MOUNT BLOCK INVERTS** (section 2B): its "WalkthroughAnnouncementPanel is actually mounted by RecordingTab" block (`:36-95`) pins the panel INSIDE RecordingTab - M1 moves that mount to `page.tsx`, turning `:37-49` (import/render/`active={active && recView==="walkannounce"}`) and `:52-76` (recView-union / restore-guard / strip walkannounce) RED. Rewrite in the SAME commit: retarget the import/render pins to `page.tsx`; DELETE the recView-union/restore-guard/strip assertions (walkannounce no longer lives in recView); KEEP `:79-95` (walkannounce stays a valid launch view). | the panel's reachability/mount canary |
| `src/app/components/bulk-course-message/bulk-course-message.wiring.test.ts` | **MOUNT-LOCATION PIN - bulk instance of the SAME class as the walkthrough file above** (enumerating all three moved surfaces' mount pins is the corrective rule). It has `HOST_FILE = "src/app/components/CanvasTab.tsx"` (`:16`) and `:188-200` `it("exactly one non-test file outside the panel directory mounts the panel, and it is the host")` asserting `expect(mounts).toEqual([HOST_FILE.replace("src/","")])`. M2b moves `<BulkCourseMessagePanel>` out of CanvasTab into `AnnouncementsSubTab.tsx`, so the required same-commit edit is: flip `HOST_FILE` to `"src/app/components/announcements/AnnouncementsSubTab.tsx"` and keep the assertion. (The `:206-207` synthetic canary is unaffected.) | the bulk panel's single-host mount-location canary |
| `src/app/components/canvas-tab/announcements-panel.wiring.test.ts` | NEEDS NO EDIT - run it for REGRESSION SAFETY only. This test roots its reachability walk AT `announcements-panel.tsx` (`FILE` const `:24`; `walkForForbiddenFiles([FILE]...)` `:406-409`) and walks OUTWARD to prove the composer acquires no capture capability (AC-2); it does NOT check who imports the composer, so the `CanvasTab`->`AnnouncementsSubTab` move does not affect it. Inbound reachability of the composer is already guaranteed by REQ-1 (exactly-one-mount-site = `AnnouncementsSubTab`). | the composer's AC-2 no-capture reachability (must stay green) |
| `src/lib/recording-launch.ts` + `recording-launch.test.ts` | REQ-8: the walkannounce route + its return-type widening | the launch-route oracle |

**Recommended reading (I proceed on it; it is my reading, not an owner ruling):**
expand A-W2's write set to include the six EDIT files above
(`content-tab/constants.ts`, `manual-rail.test.ts`, `contentTab.wiring.test.ts`,
`walkthrough-announcement.structure.test.ts`,
`bulk-course-message/bulk-course-message.wiring.test.ts`, `recording-launch.ts`+test),
and add `announcements-panel.wiring.test.ts` to the gate run (no edit). They are
all well-precedented (GRAD-SUBTAB and the course-intel removal touched the
identical set). I do NOT escalate this to the owner - it is a write-set
completeness correction the architect/implementer act on, and blocking on it would
stall the loop. The checker should confirm the architect's A-W2 brief names all of
them before the implementer starts; a build that touches only the section-6 list
will leave `contentTab.wiring.test.ts` throwing, `manual-rail.test.ts` red,
`walkthrough-announcement.structure.test.ts`'s mount block (`:36-76`) red (the
walkthrough mount moved to `page.tsx`), AND
`bulk-course-message.wiring.test.ts`'s single-host assertion (`:188-200`) red (the
bulk mount moved out of CanvasTab). **All seven run in BOTH the build gate AND the
A-W3 verify gate** (consistent with section 2's "both gates run the full canary
inventory"), and REQ-10's gate command lists every one.

If the orchestrator instead rules **MIRROR** (composer stays reachable in LMS too),
the entire LMS cascade (2C) and this gap vanish, REQ-9's sabotage changes, and
REQ-1 must allow the composer in two sites. That is a different artifact; I built
for MOVE because the ruling says "(not mirror)". Flagged so the checker can reject
if the ruling is read differently.

---

## 8. RESIDUAL REGISTER (owner, instrument, measuring step - all three, or it is a deletion)

| ID | Not proven here | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R-3 | Felt nav: chips reveal the right surface; cross-link and fab launch land on the Announcements tab; live stream survives a tab switch | repo owner | owner click-through on fresh + returning profiles | A-W3 owner check |
| R-5 | The institution-picker chrome after the composer leaves LMS: `announcements-panel.tsx` reads `useInstitutionSelection()` directly (`:45,52` `[READ]`) so it still knows the active institution, but the visible `InstitutionSwitcher` is rendered by `ContentTab` (`ContentTab.tsx:10`) - the new tab needs its own switcher or the picker is invisible there | A-W2 architect + repo owner | add an `InstitutionSwitcher` to `AnnouncementsSubTab` (reading-claim source pin) + owner sees it | A-W2 design; owner confirms |
| R-11 | `components/announcements/` has no directory `ta-`/basename canary; a new file + stray key there is uncaught | A-W2 architect / test seat | add a dir-scoped canary like `walkthrough-announcement.structure.test.ts:104-131` IF A-W2 adds files there | A-W2 build |
| R-12 | The LMS-announcements retired-pointer redirect (REQ-11) - whether the owner wants a stale LMS>Announcements user redirected to the new tab or left on LMS>Modules | repo owner | choice; if yes, a `RETIRED_GRADING_POINTERS`-shaped entry + derived-guard test | A-W2 build (recommended: redirect) |
| R-13 | MOVE vs MIRROR reading of the composer's LMS removal (section 7) - built for MOVE | orchestrator | the "(not mirror)" ruling text | checker confirms before build |

DISCHARGED since the scope: **R-7** (A29 is at HEAD, `[MEASURED git ls-files]`),
**R-2** (`ta-announcements-view` already exists, `[MEASURED grep]`).

Residuals the orchestrator must file in `docs/BACKLOG.md`: R-3, R-5, R-12 (owner
decisions / owner verification steps).

---

## 9. TEST-FILE NAMING / TRAP AVOIDANCE (binding on the implementer)

- **Prefer EXTENDING the already-classified structure tests**
  (`topLevelTabs.wiring.test.ts`, `recording-split.structure.test.ts`,
  `walkthrough-announcement.structure.test.ts`, `manual-rail.test.ts`,
  `contentTab.wiring.test.ts`) over new files. They already import the shared
  `stripComments` and are classified.
- **Any NEW `*.test.ts` must NOT mention the literal `stripComments`** - it reddens
  `src/tools/strip-comments-agreement.structure.test.ts` repo-wide until classified
  (`[MEASURED find + grep]`, `[[emoji-scan... / seat brief]]`). If a new file needs
  to strip comments, duplicate a local helper named e.g. `withoutLineComments`
  using the CRLF-safe UNANCHORED form `line.split(/\r?\n/)` + `/\/\/.*$/` (the
  anchored `/^[ \t]*\/\/.*$/gm` form is trailing-comment-blind and has a defeat on
  record here).
- **Never import a helper from another `*.test.ts`** - it re-runs that file's
  describe blocks. Duplicate (`[[no-cross-test-file-imports]]`).
- **Multi-path runs: `npm run test:paths <p1> <p2> ...`**, never raw
  `vitest run a b` (`[[test-paths-wrapper]]`).
- **No `/s` dotAll flag** in any regex - passes vitest, fails tsc (TS1501).
- Mock `canvasFetch`, never `fetch`, on any Canvas path
  (`[[tests-are-network-blocked]]`) - though A-W2 is a move with no new egress, so
  this likely does not arise.
- Every slice instrument needs an anchor-resolves assertion at BOTH ends (the
  `contentTab.wiring.test.ts:57` -1 trap is why; see section 2C). The existing
  walkthrough structure test already models this (`:586-598`).

---

## 10. WHAT I OPENED (so the checker can re-walk it)

`docs/DEV_LOOP.md`, `docs/loop/seats.md`, `docs/loop/traps-tests.md`,
`docs/announcements-tab-and-walkthrough-scope.md` (whole);
`src/app/page.tsx` (`:440-689`, `:685-832`);
`src/app/components/announcements/AnnouncementsSubTab.tsx` (whole);
`src/app/components/manual/manual-rail.ts` (whole) and `manual-rail.test.ts` (whole);
`src/app/components/CanvasTab.tsx` (whole);
`src/app/components/content-tab/constants.ts` (whole);
`src/app/components/RecordingTab.tsx` (`:30-119`, `:580-649`, `:855-909`);
`src/app/components/recording/recording-split.structure.test.ts` (whole);
`src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts` (whole);
`src/app/components/contentTab.wiring.test.ts` (`:40-112`);
`src/app/components/componentStorageKeys.structure.test.ts` (whole);
`src/app/components/tabs/topLevelTabs.wiring.test.ts` (`:300-345`, `:479-610`);
`src/app/components/tabs/tab-rails.test.ts` (grep for length/TOOLS_RAIL);
`src/app/components/home/useAppNavigation.ts` (grep announcementsView/contentView);
`src/lib/recording-launch.ts` (whole); `src/lib/drafts-nav.ts` (whole);
`src/app/components/canvas-tab/announcements-panel.tsx` (grep institution);
`src/tools/strip-comments-agreement.structure.test.ts` (grep classification).
Commands: `git ls-files src/app/components/bulk-course-message/`,
`git status --short`, `git log --oneline -8`, `wc -l` on the four touched files,
and the grep sweeps quoted inline above.

Not opened / not claimed: `announcements-panel.tsx` body beyond its institution
reads; `BulkCourseMessagePanel.tsx` body; `useTakeAnnouncement.ts` body;
`AnnouncementsSubTab`'s eventual split (does not exist yet); any rendered pixel or
browser behaviour.
