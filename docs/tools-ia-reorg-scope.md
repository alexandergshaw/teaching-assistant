# Tools information-architecture reorganization - scope

Branch `main`. Author: architecture seat. This is a SCOPE artifact: it maps the
current Tools IA, names the problems with evidence, proposes a reorganized tree,
classifies every change, cuts waves, and flags collisions. It writes NO
production code.

**Owner scope decision applied (received mid-task, not a restart).** The reorg
is tiers **(a) PURE REORG** (relabel / reorder / regroup) and **(b) RE-PARENT**
(move a child surface under a different parent, keeping the feature intact).
Tier **(c) MERGE/SPLIT is OUT OF SCOPE** for the build: merge/split
opportunities are MAPPED, but they live only in the residual register (section
7) as explicitly out-of-scope future ideas, never in the recommended target
(section 3) or the waves (section 5). The recommended target and every wave are
achievable with relabel/reorder/regroup and re-parenting alone, and no existing
view param (`manualView`/`workflowsView`/`gradingView`/`contentView`/
`buildView`/`presentationsView`/`announcementsView`/`tasksView`) is renamed or
retired (the D26 rule, `tab-rails.ts:14-21`).

## How every quantity here was measured

- Line counts: `wc -l < <file>` (Bash tool), which equals the mandated
  `@(Get-Content <file>).Count` on this checkout per `docs/loop/this-repo.md:184-195`
  (both give 964 on the file cited there; `Measure-Object -Line` is the wrong
  one and is not used here). Full `owns`-candidate measurement is in Appendix A.
- The grading-chat collision set: `git ls-files src/app/components/grading-chat/`
  plus `git ls-files --others --exclude-standard src/app/components/grading-chat/`
  (output pasted in section 6).
- Every `file:line` below was opened directly while writing this scope.

---

## EXECUTIVE SUMMARY (read this first)

### The single recommended target structure (a)+(b)

The Tools tab stays ONE flat rail of 12 chips (no grouping headings - see the
D26 argument in section 3.3). The reorg does three things:

1. **(a) Reorder the 12 chips so the implicit grouping the flat rail relies on
   actually reads as a task flow** - setup, then create, then communicate, then
   assess, then automate - instead of today's scattered order where
   "Announcements" sits third between "LMS" and "Version Control". Proposed
   Tools order:

   `Build Courses -> LMS -> Version Control -> Recording -> PowerPoint Design ->
   Artifact Templates -> Presentations -> Announcements -> Grading ->
   Workflows -> Automations -> Drafts`

   (only two chips actually move: Announcements 3rd->8th, Version Control
   4th->3rd; the Manual-then-Workflows family split is structural and is kept.)

2. **(a) Relabel the Grading inner nav so its six surfaces read as one set.**
   Drop the redundant "Grading" prefix that the parent chip already says:
   `Grading (from a recording)` -> `From a recording`, `Grading (from
   screenshots)` -> `From screenshots`. Keep `Submissions`, `Repo Grades`,
   `Drafted Grades`, `Chat`.

3. **(b) Re-parent the "record an announcement" front door out of Recording and
   into Announcements**, so Announcements holds all three announcement entry
   points (`Post an announcement | From a recording | From a walkthrough`). This
   mirrors exactly the move ANNOUNCEMENTS-TAB wave A-W2 already made for the
   walkthrough panel (`recording-split.structure.test.ts:195-202`,
   `topLevelTabs.wiring.test.ts:602-612`), so the pattern, the risks and the
   tests are known. It is the one re-parent worth its cost; it is optional and
   ships as its own wave.

**The (a) package (items 1-2) is a complete, independently shippable deliverable
with near-zero behavioral risk and NO persisted-key or param change.** The (b)
re-parent (item 3) is a separate approvable wave at moderate risk. If the owner
wants strictly minimal risk, approve (a) alone.

### The 3-5 biggest problems this fixes

1. **12 flat chips with no implicit order to lean on.** The flat rail was a
   deliberate D26 choice (`tab-rails.ts:37-41`) whose ONLY grouping is chip
   ORDER - and the current order does not cluster by purpose, so the one
   affordance the design chose is not being used. (a) fixes this.
2. **Inconsistent naming inside the Grading inner nav** - `Submissions`,
   `Repo Grades`, `Grading (from a recording)`, `Grading (from screenshots)`,
   `Drafted Grades`, `Chat` do not read as one family; two carry a redundant
   `Grading` prefix the parent already states (`manual-rail.ts:178-183`). (a)
   fixes this.
3. **Three announcement front doors split across two parents** - `Post` and
   `From a walkthrough` under Announcements (`manual-rail.ts:162-167`), but
   `record an announcement` buried as a Recording internal sub-tab
   (`RecordingTab.tsx` strip, `recording-split.structure.test.ts:150-152`). (b)
   unifies them.
4. **Mixed label grammar across the 12 chips** (one imperative "Build Courses",
   two gerunds "Recording"/"Grading", an acronym "LMS", a brand "PowerPoint
   Design", the rest plain nouns). Partly addressable by (a) relabels; the
   subjective half is owner-walk (section 7).

### One correction to the brief, measured

The brief states the Chat surface "holds ~10 sub-tabs". **It does not.**
`GradingChatPanel.tsx` (`:311-488`) is a single linear panel - instructions
field, rubric field, strictness toggle, results table, composer - with NO inner
tab strip. The "~10" is the count of SOURCE FILES in the directory
(`git ls-files` shows 20 tracked + 4 untracked, ~11 non-test), not sub-tabs. The
real ~9-tab surface in Tools is **Recording** (`recording-split.structure.test.ts:141`
pins exactly nine inner-view tabs), not Chat. The "overload: the ~10-tab chat"
prime suspect in the brief is a phantom; the genuine second overload is
Recording's nine internal sub-tabs. Section 2 treats the real one.

---

## 1. The complete current IA tree

### 1.0 Top level (context; Tools is the subject)

Top-level strip `TAB_ORDER` (`tab-sections.ts:36`), labels `TAB_LABELS`
(`tab-sections.ts:38-43`), param `tab` (persisted key `ta-active-tab`,
`useAppNavigation.ts:97,557`), default `manual` (`tab-sections.ts:47`):

| Order | Label | `tab` value | Persisted key |
|---|---|---|---|
| 1 | Courses | `courses` | `ta-active-tab` |
| 2 | **Tools** | `manual` | `ta-active-tab` |
| 3 | Library | `files` | `ta-active-tab` |
| 4 | Course Intel | `course-intel` | `ta-active-tab` |

The label "Tools" maps to the URL value `manual` deliberately (renaming the live
value would break bookmarks - `tab-sections.ts:22-29`).

### 1.1 Tools = one flat rail of 12 chips

Built by `TOOLS_RAIL_ITEMS` (`tab-rails.ts:136-153`) as `MANUAL_VIEW_ORDER` then
`WORKFLOWS_VIEW_ORDER`, concatenated. The rail is a PRESENTATION over existing
params; the section (`manual`/`workflows`) is DERIVED from which family a chip
belongs to, never picked (`tab-rails.ts:1-41`, persisted key `ta-tools-section`
at `useAppNavigation.ts:71,589`). The highlighted chip is computed, never stored
(`toolsRailItemFor`, `tab-rails.ts:167-173`).

**Manual family** - section `manual`, param `manualView` (persisted key
`ta-manual-view`, `useAppNavigation.ts:52,561`). Order list `MANUAL_VIEW_ORDER`
(`manual-rail.ts:210-220`); labels `MANUAL_VIEW_LABELS` (`manual-rail.ts:222-232`):

| Chip order | Label | `manualView` value | Has child tabs? |
|---|---|---|---|
| 1 | Build Courses | `course-planning` | yes - Build |
| 2 | LMS | `content` | yes - LMS |
| 3 | Announcements | `announcements` | yes - Announcements |
| 4 | Version Control | `version-control` | no |
| 5 | Recording | `recording` | internal recView strip (see 1.3) |
| 6 | PowerPoint Design | `ppt-design` | no |
| 7 | Artifact Templates | `artifact-design` | no |
| 8 | Presentations | `presentations` | yes - Presentations |
| 9 | Grading | `grading` | yes - Grading |

**Workflows family** - section `workflows`, param `workflowsView` (persisted key
`ta-workflows-view`, `useAppNavigation.ts:64,565`). Order `WORKFLOWS_VIEW_ORDER`
(`tab-sections.ts:110`); labels (`tab-sections.ts:111-115`); rendered by
`WorkflowsPanel.tsx:33-41`:

| Chip order | Label | `workflowsView` value | Renders | Has child tabs? |
|---|---|---|---|---|
| 10 | Workflows | `workflows` | `WorkflowsTab` | no |
| 11 | Automations | `automations` | `AutomationsTabView` | no |
| 12 | Drafts | `drafts` | `MessageDraftsTab` (message drafts) | no; carries the unread-drafts badge, `TOOLS_RAIL_DRAFTS_ID` (`tab-rails.ts:163`) |

### 1.2 The child tabs (the level below a rail chip)

The inner nav is `ManualRail.tsx:37-85`; its destinations and ARIA name both
come from ONE table `INNER_NAV` (`manual-rail.ts:254-260`) via
`getInnerDestinations` / `getInnerNavAriaLabel` (`manual-rail.ts:274-287`) - so
"has inner destinations" and "has an accessible name" are the same set by
construction (parity pinned at `manual-rail.test.ts:282-289`).
`getInnerNavAriaLabel` must stay correct (brief constraint); it is fed from the
table, never a literal (`topLevelTabs.wiring.test.ts:305-317`).

| Parent chip | ARIA name | Param (persisted key) | Children (`id` -> label), order from `destinations` |
|---|---|---|---|
| Build Courses (`course-planning`) | "Course build modes" | `buildView` (`ta-build-view`) | `build-new` -> "New Build", `build-prebuilt` -> "Pre Built" (`manual-rail.ts:121-124`) |
| LMS (`content`) | "LMS views" | `contentView` (`ta-content-view` = `VIEW_KEY`, `content-tab/constants.ts:6`) | `lms-modules` Modules, `lms-assignments` Assignments, `lms-quizzes` Quizzes, `lms-pages` Pages, `lms-files` Files, `lms-inbox` Inbox (`manual-rail.ts:128-135`) |
| Announcements (`announcements`) | "Announcements views" | `announcementsView` (`ta-announcements-view`) | `announcements-post` -> "Post an announcement", `announcements-walkthrough` -> "From a walkthrough" (`manual-rail.ts:162-167`) |
| Presentations (`presentations`) | "Presentations views" | `presentationsView` (`ta-presentations-view`) | `presentations-slide-deck` -> "Slide Deck Creation", `presentations-pipeline` -> "Slide Deck Pipeline" (`manual-rail.ts:169-173`) |
| Grading (`grading`) | "Grading tools" | `gradingView` (`ta-grading-view`) | `grading-run` -> "Submissions", `grading-repos` -> "Repo Grades", `grading-recording` -> "Grading (from a recording)", `grading-snapshots` -> "Grading (from screenshots)", `grading-drafts` -> "Drafted Grades", `grading-chat` -> "Chat" (`manual-rail.ts:176-184`) |
| Version Control, Recording, PowerPoint Design, Artifact Templates | none (null) | - | single destination, no inner nav (`manual-rail.test.ts:269-273`) |

### 1.3 Grandchildren

- **Grading > "Chat" (`grading-chat`) = `GradingChatPanel`** - a SINGLE linear
  panel (`GradingChatPanel.tsx:311-488`): instructions field, rubric field, a
  "Grading strictness" segmented toggle + optional feedback-word-count field, a
  results table, and a sticky composer. **No inner tab strip.** Mounted as an
  always-rendered display-toggled sibling in `page.tsx`
  (`topLevelTabs.wiring.test.ts:593-600`). Its own persisted keys are
  `ta-grading-chat-harshness` (`GradingChatPanel.tsx:61`) and
  `ta-grading-chat-feedback-length` (`:83`); two older global slots
  (`ta-grading-chat-instructions`, `ta-grading-chat-rubric`) are frozen and no
  longer read (`:46-50`). Per-run setup is Canvas-scoped memory
  (`chatSetupMemory.ts`). These are WITHIN-surface state, not nav selection.
- **Grading > `grading-recording` / `grading-snapshots`** - `GradingRecordingPanel`
  and `SnapshotGradingPanel`, each an always-mounted display-toggled capture
  surface (`topLevelTabs.wiring.test.ts:570-586`).
- **Recording (`recording`) internal recView strip** - nine inner-view tabs
  (NOT the manualView/gradingView scheme; a Recording-local `recView` param,
  persisted key `ta-rec-view`): `record`, `announcement` (record for an
  announcement), `discussions`, `messages`, `moduledeck`, `speed`, `captions`,
  `slides`, `avatar` (`recording-split.structure.test.ts:141-148, 174-181`;
  record/announcement share one panel wrapper, so nine tabs = eight tabpanels,
  `:215-218`). This is the real ~9-tab surface in Tools.

### 1.4 Navigation-selection persisted keys (the ones a reorg must not strand)

Enumerated from `useAppNavigation.ts:52-72` and `content-tab/constants.ts:6`:
`ta-active-tab`, `ta-tools-section`, `ta-courses-section`, `ta-library-section`,
`ta-manual-view`, `ta-workflows-view`, `ta-tasks-view`, `ta-build-view`,
`ta-content-view`, `ta-grading-view`, `ta-presentations-view`,
`ta-announcements-view`, `ta-rec-view` (Recording-internal), and the read-only
legacy-migration `ta-drafts-view` (`useAppNavigation.ts:178,248,412`). Each nav
value is validated by a guard derived from its ordered list, so order is
presentation-only and a value's acceptance is independent of its position
(`url-state.ts:174-243`, `manual-rail.ts:240-244`).

---

## 2. Problems, evidenced

**P1 - OVERLOAD, but the flat rail's one grouping affordance (order) is unused.**
Twelve chips in one row; the design itself calls it "a lot" (`tab-rails.ts:37`)
and the test pins label-disjointness precisely so "twelve items in one row stay
distinguishable" (`tab-rails.test.ts:106-111`). D26 deliberately rejected
heading rows and said the ORDER carries the grouping implicitly
(`tab-rails.ts:39-41`) - but the current `MANUAL_VIEW_ORDER`
(`manual-rail.ts:210-220`) does not cluster by purpose: Announcements sits 3rd,
between LMS (2nd) and Version Control (4th), so content-creation,
course-setup, communication and assessment chips are interleaved. The one
affordance the design chose is not being used.

**P2 - OVERLOAD, real location: Recording's nine internal sub-tabs.**
`recording-split.structure.test.ts:141` pins exactly nine inner-view tabs in one
strip (`record/announcement/discussions/messages/moduledeck/speed/captions/
slides/avatar`). Several are communication/content artifacts bolted into a
capture surface (`discussions`, `messages`, `moduledeck`, `announcement`). This
is the genuine second overload the brief attributed to Chat.

**P3 - INCONSISTENT NAMING inside the Grading inner nav.** Six labels that do not
read as one set: `Submissions`, `Repo Grades`, `Grading (from a recording)`,
`Grading (from screenshots)`, `Drafted Grades`, `Chat`
(`manual-rail.ts:178-183`, pinned `manual-rail.test.ts:469-476`). Two carry a
redundant `Grading` prefix the parent chip already states.

**P4 - MIXED GRAMMAR across the 12 chip labels.** One imperative verb phrase
("Build Courses"), two gerunds ("Recording", "Grading"), an acronym ("LMS", over
param `content`), a brand noun ("PowerPoint Design"), the rest plain nouns
(`manual-rail.ts:222-232`, `tab-sections.ts:111-115`). Four labels differ from
their param name (`content`->LMS, `course-planning`->Build Courses,
`artifact-design`->Artifact Templates, `ppt-design`->PowerPoint Design) - which
is allowed, but the surface grammar is inconsistent.

**P5 - REDUNDANCY / cross-parent spread of announcements.** Three announcement
front doors live under TWO parents: `Post an announcement` and `From a
walkthrough` under Announcements (`manual-rail.ts:162-167`), while "record an
announcement" is a Recording internal sub-tab
(`recording-split.structure.test.ts:150-152`; `TakeAnnouncementPanel` mounted
only by RecordingTab, `topLevelTabs.wiring.test.ts:660-662`). A user composing an
announcement must know to look in two different Tools chips.

**P6 - a vestige, not a live bug.** `version-control` is both a live `manualView`
chip AND a legacy member of `ContentView` (`content-tab/constants.ts:3`) that is
deliberately excluded from `LMS_VIEWS` so it is never a navigable LMS inner tab
(`url-state.ts:212-221`). No live redundancy; noted so a later reader does not
"discover" it as one.

**P7 - CLICK COST is already near-minimal; the cost here is visual scan, not
clicks.** Measured against the current layout (app opens on Tools > Build
Courses, `tab-sections.ts:47`, `url-state.ts:198-200`):

| Destination | Clicks from app open | Notes |
|---|---|---|
| Build Courses (Pre Built) | 0 | default landing |
| LMS (Modules) | 1 (chip; Modules is the default inner view) | a specific LMS view: 2 |
| Grading (Submissions) | 1 (chip; `run` is default) | Chat / From a recording: 2 |
| Recording (record) | 1 (chip; `record` default) | a specific recording mode: 2 |
| Workflows / Automations / Drafts | 1 each (top-level chips, no inner nav) | - |
| Announcements (Post) | 1 | From a walkthrough: 2 |

Repeat use is identical or cheaper: rail selection persists (section 1.4), so a
reload returns to the remembered view at 0 clicks. **Every high-traffic
destination is already 1-2 clicks.** A reorder or relabel changes NONE of these
counts - it reduces the time to FIND the right chip in a 12-item row, which is
scan cost, and (because no component renders here, section 2 of `this-repo.md`)
is an owner-walk judgement, not a machine metric. Any genuine click reduction
would require promoting a deep destination up a level, which is merge/split and
out of scope (residual, section 7). **This scope does not reduce clicks; it
improves coherence and scannability. Stated plainly so Verify does not credit a
click win the diff will not contain.**

---

## 3. The proposed reorganized IA (a)+(b)

### 3.1 (a) Reorder the Tools rail

Change `MANUAL_VIEW_ORDER` (`manual-rail.ts:210-220`) to cluster by task flow;
keep `course-planning` first so the default-selected chip (`normalizeManualView(null)`
= `course-planning`, `url-state.ts:198-200`) is still the first chip. Workflows
family stays after the Manual family (structural concatenation,
`tab-rails.ts:136-153`) and reads naturally as the "automate" cluster.

| New order | Label | `manualView` | Cluster | Moved? |
|---|---|---|---|---|
| 1 | Build Courses | `course-planning` | Set up | - |
| 2 | LMS | `content` | Set up | - |
| 3 | Version Control | `version-control` | Set up | up from 4 |
| 4 | Recording | `recording` | Create | - |
| 5 | PowerPoint Design | `ppt-design` | Create | - |
| 6 | Artifact Templates | `artifact-design` | Create | - |
| 7 | Presentations | `presentations` | Create | - |
| 8 | Announcements | `announcements` | Communicate | down from 3 |
| 9 | Grading | `grading` | Assess | - |
| 10-12 | Workflows / Automations / Drafts | `workflowsView` | Automate | unchanged |

Rationale: only two chips move; the result groups the three content-creation
surfaces (Recording, PowerPoint Design, Artifact Templates, Presentations)
contiguously, keeps the three setup surfaces first, and puts communication then
assessment before the automation family. Pure presentation change: no param,
no persisted key, no default-view change, no behavior change.

### 3.2 (a) Relabel the Grading inner nav

Change two labels in `destinations` (`manual-rail.ts:180-181`):

| `id` | Current label | Proposed label | Why |
|---|---|---|---|
| `grading-recording` | Grading (from a recording) | **From a recording** | parent chip already says Grading |
| `grading-snapshots` | Grading (from screenshots) | **From screenshots** | same |

Keep `Submissions`, `Repo Grades`, `Drafted Grades`, `Chat`. Result reads as one
set of grading sources. No id, param, order or persisted-key change.

Optional, owner-walk: `Repo Grades` -> `Repositories` (consistency with the
other source-named entries); flagged in section 7, not built by default.

### 3.3 Why NOT reintroduce a grouping level (the D26 argument, answered explicitly)

The brief asks me to argue if I recommend a new nav level. **I recommend against
it, and the recommendation is reinforced by the owner's scope decision.** D26's
"NO GROUPING INSIDE THE RAIL" (`tab-rails.ts:37-41`) is load-bearing: a
"Manual"/"Workflows" heading row rebuilds the exact intermediate level the D25->D26
merge removed, wearing a different hat, and `topLevelTabs.wiring.test.ts:211-228`
enforces "exactly ONE navigation rail" per merged tab specifically to stop a
second level sneaking back. Reintroducing a level is also a SPLIT of the flat
rail, which is tier (c) and out of scope. So "regroup" here is satisfied by
reorder-to-cluster (3.1) - which is the grouping D26 itself endorsed ("the order
instead carries the grouping implicitly") - with no new level. If the owner ever
wants real grouping, that is the out-of-scope item O3 in section 7, where the
argument for a level would have to beat D26 on its own terms.

### 3.4 (b) Re-parent "record an announcement" into Announcements

Move the record-for-an-announcement front door OUT of Recording's internal strip
and INTO the Announcements inner nav as a third child, so Announcements holds:

`Post an announcement | From a recording | From a walkthrough`

This is a genuine re-parent with **direct precedent in this tree**:
ANNOUNCEMENTS-TAB wave A-W2 already moved the walkthrough-announcement panel the
same way - out of `recView` (`recording-split.structure.test.ts:195-202` pins
`walkannounce` gone from the restore guard) and into an always-mounted sibling
revealed by `announcementsView=walkthrough` (`topLevelTabs.wiring.test.ts:602-612`).
The record-announcement move follows that pattern exactly:

- Recording strip 9 -> 8 tabs; its shared record/announcement panel wrapper
  collapses to a single record panel (`recording-split.structure.test.ts:141,
  150-152, 215-218, 252-282`).
- Add an `announcementsView` value (e.g. `recording`) - an ADDITION to
  `ANNOUNCEMENTS_VIEWS` (`manual-rail.ts:76-82`), not a rename/retire of any
  protected param, so the D26 rule holds (A-W2 set the precedent that a
  Recording-internal `recView` value is below the protected tab/section/view
  params and may be retired).
- Mount `TakeAnnouncementPanel` as an always-mounted display-toggled sibling
  under the Announcements guard (the A-W2 shape,
  `topLevelTabs.wiring.test.ts:540-568`), since it holds live capture.
- **A stored `ta-rec-view=announcement` must be migrated** so returning users do
  not strand on a retired recView value - exactly as A-W2 handled `walkannounce`
  (requirement, not optional; tracked in section 7 R-b1).

Classified (b), moderate risk. It does NOT reduce clicks (still chip + inner
tab); its value is unifying the three announcement doors (P5).

---

## 4. The (a)/(b)/(c) ledger

Approve by tier.

### (a) PURE REORG - label/order/grouping only, no behavior change, low risk

| id | Change | Touches | Param/key change |
|---|---|---|---|
| a1 | Reorder `MANUAL_VIEW_ORDER` to the 3.1 sequence | `manual-rail.ts:210-220` | none |
| a2 | Relabel `grading-recording` -> "From a recording", `grading-snapshots` -> "From screenshots" | `manual-rail.ts:180-181` | none |
| a3 (optional, owner-walk) | Relabel `Repo Grades` -> "Repositories" | `manual-rail.ts:179` | none |

### (b) RE-PARENT - a child surface moves parent, feature intact, moderate risk

| id | Change | Touches | Param/key |
|---|---|---|---|
| b1 | Move record-an-announcement from Recording's recView strip into Announcements as `announcementsView` third child (3.4) | `RecordingTab.tsx`, `manual-rail.ts`, `url-state.ts`, `page.tsx`, plus a `ta-rec-view=announcement` migration | ADD one `announcementsView` value; retire Recording-internal `recView=announcement` (below the protected params; A-W2 precedent) |

### (c) MERGE/SPLIT - OUT OF SCOPE (mapped only; see section 7)

Not proposed, not built. Listed as residual ideas O1-O4.

---

## 5. Waves and write sets

Each wave is independently shippable. `npm run test:paths <p1> <p2> ...` is used
for every multi-file gate (never a raw multi-path vitest, which silently drops
unmatched args - `this-repo.md:52-66`). The repo-wide
`src/file-size-ceiling.structure.test.ts` runs in every wave gate unconditionally
(`this-repo.md:42-49`); no file in any write set is near 1000 lines (Appendix A -
the largest, `RecordingTab.tsx`, is 900 and wave W2 only REMOVES from it).

### Wave W1 - (a) reorder + relabel. Low risk. Depends on nothing.

**Write set (edits):**
- `src/app/components/manual/manual-rail.ts` (reorder `MANUAL_VIEW_ORDER`;
  relabel two `destinations` entries)
- `src/app/components/manual/manual-rail.test.ts` (re-freeze pinned labels/order)
- `src/app/components/tabs/tab-rails.test.ts` (re-freeze the ordered id list)

**Frozen tests that MUST be updated in the same commit (object / instrument /
direction):**
- `tab-rails.test.ts:54-68` - the exact ordered `TOOLS_RAIL_ITEMS` id list and
  `toHaveLength(12)`. Object: the rail's id order. Instrument: `toEqual([...])`.
  Direction: FAILS if the built order differs from the re-frozen literal. Re-freeze
  to the 3.1 order; length stays 12.
- `manual-rail.test.ts:460-477` - the Grading inner-destination labels (and ids).
  Object: the six grading labels. Instrument: `toEqual([...])`. Direction: FAILS
  if a label differs. Re-freeze `grading-recording`/`grading-snapshots` labels;
  ids unchanged.
- `manual-rail.test.ts:233-274` - `getInnerDestinations` id lists are
  order-stable per view and UNCHANGED by W1 (W1 reorders the OUTER rail, not any
  inner nav), so these need no edit; the implementer must confirm (grep),
  because a stray reorder of the Grading inner list would break `:251-261`.

**Gates:** the above via `npm run test:paths src/app/components/tabs/tab-rails.test.ts
src/app/components/manual/manual-rail.test.ts src/app/components/tabs/topLevelTabs.wiring.test.ts`,
plus `src/file-size-ceiling.structure.test.ts`, plus `npx tsc --noEmit`,
`npm run lint`. `topLevelTabs.wiring.test.ts` already derives its per-view branch
checks from `MANUAL_VIEW_ORDER` (`:345-356`) so a reorder needs no edit there -
confirm it stays green.

**No persisted-key or param change** - a1/a2 touch only labels and outer order;
every `manualView`/`gradingView` value and every `ta-` key is unchanged, so
nothing is stranded.

### Wave W2 - (b) re-parent record-announcement. Moderate risk. Independent of W1 (disjoint write sets) but see section 6 for the page.tsx/RecordingTab serialization.

**Write set (edits):**
- `src/app/components/RecordingTab.tsx` (remove the `announcement` strip entry;
  collapse the shared record/announcement wrapper; drop `announcement` from the
  recView restore guard; keep/relocate `TakeAnnouncementPanel` mount per A-W2)
- `src/app/components/recording/recording-split.structure.test.ts` (counts
  9->8 tabs, 8->7 tabpanels, restore-guard and shared-wrapper assertions)
- `src/app/components/manual/manual-rail.ts` (+ `.test.ts`) - add the
  Announcements third child destination and `ANNOUNCEMENTS_VIEWS` member
- `src/app/url-state.ts` (`normalizeAnnouncementsView` accepts the new value)
- `src/app/page.tsx` (always-mounted `TakeAnnouncementPanel` under the
  Announcements guard; the A-W2 display-toggle shape)
- `src/app/components/home/useAppNavigation.ts` (migration of a stored
  `ta-rec-view=announcement`)
- `src/app/components/tabs/topLevelTabs.wiring.test.ts` (add the new
  always-mounted-panel assertion, A-W2 shape)

**Frozen tests that MUST be updated in the same commit:**
- `recording-split.structure.test.ts:141` (nine -> eight), `:215-218` (eight ->
  seven tabpanels), `:228-250` (the keys array and panelTargets size), `:174-181`
  (restore guard no longer lists `announcement`), `:252-282` (shared-wrapper
  aria-labelledby). Object: the Recording strip's counts and the retired value.
  Instrument: exact-count / `not.toContain`. Direction: FAILS if a count or the
  retired value is wrong. This is the A-W2-shaped surgery (`traps-spec.md:58-64`:
  a sub-tab needs the full set of edits - launch-view union, recView union,
  restore ladder, strip literal - or it ships dead / reverts on reload).
- `manual-rail.test.ts:263-267` (Announcements now has THREE children).
- `topLevelTabs.wiring.test.ts:602-612` is the model to copy for the new panel.

**Gates:** `npm run test:paths` over the six touched test files above, plus
`src/file-size-ceiling.structure.test.ts`, tsc, lint. Because W2 touches
`page.tsx`, run the full `topLevelTabs.wiring.test.ts` and the grading-chat mount
assertions to prove no sibling mount regressed.

---

## 6. Serialization and collision flags

**The grading-chat work in flight.** Measured set
(`git ls-files src/app/components/grading-chat/` + untracked):

```
ChatComposer.tsx  GradingChatPanel.structure.test.ts  GradingChatPanel.tsx
LatestResultCard.tsx  chatFileBatch.ts(+test)  chatFrameCapture.ts(+test)
chatSetupFill.ts(+test)  chatSetupMemory.ts(+test)  chatSubmissionIntake.ts(+test)
grading-chat-storage-keys.structure.test.ts  grading-chat.module.css
latestGradedResult.ts(+test)  useContinuousGradingRun.ts(+lifecycle.test)
chatSeamDiagnostic.ts(+test,+wiring.test)  useContinuousGradingRun.diagnostic.test.ts
```

GRADING-DIAGNOSTICS-COVERAGE W2b (in flight) edits
`useContinuousGradingRun.ts`, `GradingChatPanel.tsx`, and a grading-chat intake
file; BULK-ZIP and INFER-FLAG also touch grading-chat files.

**Collision verdict, by wave:**

- **W1 (reorder + relabel): NO collision with any grading-chat work.** W1's write
  set is `manual-rail.ts`, `manual-rail.test.ts`, `tab-rails.test.ts` - none are
  under `src/app/components/grading-chat/`, and W1 does NOT touch `page.tsx`. The
  Tools IA lives in `manual-rail.ts` / `tab-sections.ts` / `tab-rails.ts` /
  `url-state.ts` / `useAppNavigation.ts` / `page.tsx`, a set DISJOINT from
  `grading-chat/*`. Relabeling the Grading inner nav changes labels in
  `manual-rail.ts`'s `destinations`, NOT the `grading-chat` chip's own code; the
  `Chat` label is untouched. **W1 may run concurrently with the grading-chat
  work.**
- **W2 (re-parent): collides on `page.tsx` and `RecordingTab.tsx`, NOT on
  grading-chat leaves.** W2 edits `page.tsx` (adds an always-mounted panel). The
  grading-chat work touches `GradingChatPanel.tsx` et al. - different files - but
  `page.tsx` is the ONE shared file where the GradingChatPanel mount lives
  (`topLevelTabs.wiring.test.ts:593-600`). If any grading-chat wave edits
  `page.tsx` (e.g. to change the GradingChatPanel mount), **W2 MUST serialize
  after it** (one writer of `page.tsx` at a time - `parallel-disjointness.md`;
  `page.tsx` is a shared file like any other). W2 also owns `RecordingTab.tsx`
  and the recording structure test, which no grading-chat wave touches, but any
  OTHER Recording wave must serialize against W2.
- **tsc is a shared singleton** (`this-repo.md:156-162`): W1 and W2 (or either
  and a grading-chat wave) must not run `npx tsc --noEmit` on the tree
  simultaneously - exactly one caller per wave gate.

---

## 7. Residual register

Each entry: residual / owner / instrument / measuring step. An entry missing any
of the three is a deletion and is called that (none here are).

### Requirements this scope creates (must be built if its wave is approved)

- **R-b1 - migrate a stored `ta-rec-view=announcement`.** Owner: W2 implementer.
  Instrument: `recording-split.structure.test.ts` restore-guard assertion
  (`:174-202` pattern) + a `useAppNavigation.ts` migration mirroring the
  `walkannounce` handling. Step: W2 wave gate. Without it, a returning user on
  the old record-announcement tab strands on a retired recView value. NOT
  optional if b1 ships.

### Owner-walk claims (no machine instrument exists here; no component renders)

- **OW1 - does the reordered rail "feel right".** Owner: repo owner. Instrument:
  visual walk of the Tools rail. Step: owner review of the W1 diff in the running
  app. (The machine side only proves the order equals the re-frozen literal, not
  that the clustering reads well.)
- **OW2 - do the relabels read as this app's voice** (incl. the optional
  `Repo Grades` -> `Repositories`, a3). Owner: repo owner. Instrument: read-aloud
  review. Step: owner review of W1 diff.
- **OW3 - scan-cost / click-cost judgement.** Owner: repo owner. Instrument:
  none automatable (no render, `this-repo.md:134`). Step: owner walk. P7 shows
  click counts are unchanged by this scope; whether the reorder reduces scan time
  is the owner's call.
- **OW4 - ARIA announcement of the new Announcements inner nav after b1.** Owner:
  repo owner. Instrument: `getInnerNavAriaLabel` parity test
  (`manual-rail.test.ts:282-289`) proves the WIRING; what assistive tech actually
  says is owner-walk. Step: owner review of W2.

### Machine-checkable claims (the instruments that DO exist)

- Rail id order and length: `tab-rails.test.ts:54-68`.
- Grading inner-nav labels/ids: `manual-rail.test.ts:460-477`.
- No registered view without a chip (no-orphan): `tab-rails.test.ts:71-95`,
  `topLevelTabs.wiring.test.ts:345-367`.
- No stranded persisted key: `componentStorageKeys.structure.test.ts:219-262`
  (directory exact-set), the recording key canary
  (`recording-split.structure.test.ts:360-435`), and
  `grading-chat-storage-keys.structure.test.ts`. W1 adds/removes NO key; W2's
  recView retirement must keep these green.
- Recording strip counts after b1: `recording-split.structure.test.ts:141,215-250`.

### OUT-OF-SCOPE merge/split ideas (mapped per owner instruction; NOT built, NOT in section 3 or 5)

- **O1 (MERGE) - unify all announcement authoring under Announcements.** If the
  owner declines the b1 re-parent, the three-doors spread (P5) stays. A fuller
  version would also fold `discussions`/`messages` reply surfaces out of
  Recording into a communication parent - a merge, out of scope. Owner decision.
- **O2 (MERGE) - PowerPoint Design + Presentations.** Both are deck creation
  (`ppt-design` single destination; `presentations` with slide-deck/pipeline).
  Folding `ppt-design` in as a third `presentationsView` child would retire a
  `manualView` value (D26-protected) and merge two features - out of scope.
- **O3 (SPLIT) - reintroduce a grouping level for the 12-chip rail.** Argued
  against in 3.3; if ever revisited it must beat D26 (`tab-rails.ts:37-41`) and
  `topLevelTabs.wiring.test.ts:211-228` on their own terms. Out of scope.
- **O4 (SPLIT/promote, click reduction) - promote a high-traffic grading surface
  to a top-level Tools chip** to cut it from 2 clicks to 1 (the only path to an
  actual click reduction, P7). A split - out of scope. Owner decision if click
  cost ever becomes the priority.
- **O5 (cleanup, not reorg) - the `version-control` legacy `ContentView` member
  vestige** (`content-tab/constants.ts:3`, P6). Harmless today; a tidy-up, not
  part of this reorg.

---

## Appendix A - `owns`-candidate line counts

Measured with `wc -l < <file>` (Bash), equal to `@(Get-Content <file>).Count` on
this checkout per `this-repo.md:184-195`:

```
455  src/app/components/manual/manual-rail.ts
671  src/app/components/manual/manual-rail.test.ts
196  src/app/components/tabs/tab-rails.ts
385  src/app/components/tabs/tab-rails.test.ts
199  src/app/components/tabs/tab-sections.ts
739  src/app/components/tabs/topLevelTabs.wiring.test.ts
900  src/app/components/RecordingTab.tsx
618  src/app/components/recording/recording-split.structure.test.ts
887  src/app/page.tsx
507  src/app/url-state.ts
826  src/app/components/home/useAppNavigation.ts
 85  src/app/components/manual/ManualRail.tsx
```

W1's write set (`manual-rail.ts` 455, `manual-rail.test.ts` 671,
`tab-rails.test.ts` 385) is far from the 1000-line ceiling. W2 touches
`RecordingTab.tsx` (900, and W2 only removes from it), `page.tsx` (887, W2 adds a
small always-mounted panel + guard - must be re-measured at W2's wave gate to
confirm it stays under 1000), and the test files listed in section 5.

Files that READ the edited files as source text (the tests that go red on a
correct change and must be in the wave gate), derived by grepping for each
edited symbol/path: for W1 - `tab-rails.test.ts`, `manual-rail.test.ts`,
`topLevelTabs.wiring.test.ts` (all read `MANUAL_VIEW_ORDER` / the rail / the
grading labels). For W2 - additionally `recording-split.structure.test.ts`
(reads `RecordingTab.tsx` as source) and `topLevelTabs.wiring.test.ts` (reads
`page.tsx` as source). The implementer must re-derive this set with its own grep
and report what this list missed (`traps-spec.md:30-34`: this enumeration is a
FLOOR, not the set).
