# Walkthrough-announcement -> mimic the chat grading view, minimize clicks / click-distance / scroll-distance - scope + wave plan

Status: SCOPE, authored by the architecture seat (`loop-architect`). Recon +
SHAPE decision + wave cut. NO production code, NO CSS, NO test was changed by
this seat; this file is the only artifact. Round 1 of two; a fresh
`loop-checker` reads this before any implementer does.

Owner request, verbatim (2026-10-11): "make the announcement from a walkthrough
view mimic the llm chat grading view - when designing this, be sure to minimize
clicks, click distance, and scroll distance."

**This is NOT a first-authored scope. It restructures
`docs/walkthrough-announcement-chat-mimic-scope.md` (owner 2026-10-07, "the
announcement from a walkthrough needs to mimic the chat"), whose recommendations
HAVE SHIPPED.** Section 1 proves the shipped state from the tree; the disposition
table (section 11) maps every prior requirement to kept / handed-over /
withdrawn. The new owner ask adds the PARAMOUNT distance dimension (clicks,
click-distance, scroll-distance), which reopens exactly the chat SHAPE the
skin-only prior scope recorded as "NO MAP".

Evidence tags: `[MEASURED <cmd>]` a command run in this checkout, output quoted;
`[READ file:line]` opened at that line (nothing renders under vitest here, so
every layout/behaviour claim is a READ claim); `[ARITHMETIC]` computed from READ
facts; `[ESTIMATE]` a pixel figure from CSS tokens and remembered MUI sizes, NOT
measured - the owner instrument in section 5.4 replaces every one; `[OWNER]`
only a browser can settle it.

---

## 0. Measured quantities and the command that produced each

All from repo root, this checkout, HEAD `[MEASURED git rev-parse --short HEAD]`
= re-measure at the wave gate (the prior scope measured `81a148f1`; the tree has
moved - line counts below differ from it). Re-measure every line count with
`@(Get-Content <f>).Count` (two tools disagree by up to 138 lines here,
`docs/loop/this-repo.md`).

| Quantity | Value | Command |
|---|---|---|
| `WalkthroughAnnouncementPanel.tsx` lines | 840 | `@(Get-Content ...WalkthroughAnnouncementPanel.tsx).Count` |
| `AnnouncementCourseFieldset.tsx` lines | 288 | same form |
| `AnnouncementDraftSlot.tsx` lines | 398 | same form |
| `GradingChatPanel.tsx` lines (the target to mimic) | 563 | same form |
| `TakeAnnouncementPanel.tsx` lines (sibling, already chat-mimicked) | 660 | same form |
| `grading-chat.module.css` lines | 114 | same form |
| `announcement-chat.module.css` lines (the skin, already imported here) | 103 | same form |
| `WalkthroughRunBar.module.css` lines | 16 | same form |
| `walkthrough-announcement.structure.test.ts` lines | 956 | same form |
| `page.module.css` lines | 7075 | same form (FROZEN - add no class there) |
| Walkthrough panel mount | `page.tsx:789`, bare display-toggled `<div>` sibling | `grep -n "<WalkthroughAnnouncementPanel" src/app/page.tsx` |
| Grading-chat mount | `page.tsx:771`, the SAME bare display-toggled sibling idiom | `grep -n "<GradingChatPanel" src/app/page.tsx` |
| Shared scroll ancestor of both | `.tabContainer` (`page.tsx:460`), `overflow: clip` and explicitly NOT a scroll container | `[READ page.module.css:14-27]` (comment `:24-26`) |
| Persisted `ta-rec-wta-*` keys, exact count pinned | 6 (`course, module, notes, emoji, resources, autodraft`) | `[READ walkthrough-announcement.structure.test.ts:107-114]` `expect(distinctKeys.size).toBe(6)` |

---

## 1. BRIEF FROM THE TREE: the chat-mimic SKIN already shipped

The prior scope's W1 is in the tree today. Opened and confirmed:

- Panel root is `<div className={`${styles.card} ${styles.form}`}>`
  `[READ WalkthroughAnnouncementPanel.tsx:571]` - the prior `.adaptPanel`
  self-drawn box is gone (F-FRAME shipped).
- Title is `<h2 className={annChat.title}>` `[READ :572]` (F-TITLE shipped).
- The panel imports the shipped skin:
  `import annChat from "../recording/announcement-chat.module.css";`
  `[READ :40]` (F-CSS option (a) shipped).
- The video-script region is `<fieldset className={annChat.latestCard}>` with
  `<legend className={annChat.latestCardLabel}>Video script draft</legend>`
  `[READ :797-798]` (F-PREVIEW shipped).
- The run bar is `<div className={`${styles.ghActions} ${runBar.runBarSticky}`}>`
  `[READ :656]`, sticky at `top: 0` `[READ WalkthroughRunBar.module.css:8-16]`.

**So "mimic the chat" at the SKIN level is done.** What has NOT shipped is the
chat's SHAPE in the two ways that actually cut clicks and scroll - and that is
the whole content of the new owner ask.

---

## 2. What makes the chat "chat-like" - characterized from the TARGET code

`GradingChatPanel.tsx`, opened whole. The shape has four load-bearing
properties, each cited:

1. **Compact setup that COLLAPSES to a one-line strip once the run is
   established.** Pre-session the two setup fields are `chatStyles.compactField`
   (a 72px-min textarea, not the 220px default) `[READ GradingChatPanel.tsx:429-465]`
   and `grading-chat.module.css:80-100`; once `sessionReady`
   (`driver.headerState === "ready"`, `[READ :233]`) they are REPLACED by
   `<p className={chatStyles.setupSummary}>Instructions and rubric are set for
   this session.</p>` `[READ :468-469]`. The whole setup column shrinks from two
   multi-row fields to one line.
2. **A sticky BOTTOM dock holding the one primary action, reachable with zero
   scroll however tall the content grows.** `<div className={chatStyles.stickyComposer}>`
   `[READ :539-560]` wraps the error, the progress and the composer, and its rule
   is `position: sticky; bottom: 0` `[READ grading-chat.module.css:8-18]`.
3. **A growing STREAM between the setup and the dock** (`chatStyles.stream`,
   `[READ :515-532]`; the empty state is `chatStyles.streamEmpty`, `:533-535`).
4. **Few setup fields; the primary action is one click, no scroll to reach it.**

The sibling `TakeAnnouncementPanel.tsx` (already chat-mimicked, commit per the
prior template) carries the same vocabulary: `annChat.setupSummary` for the
"Posted to X" strip `[READ TakeAnnouncementPanel.tsx:266]`, `annChat.latestCard`
for the armed preview `[READ :607-614]`, and a BOTTOM `annChat.dock` for the
Post/Save row `[READ :624-655]`.

---

## 3. What the walkthrough has today vs that shape (the gap)

`WalkthroughAnnouncementPanel.tsx`, opened whole.

| Chat property | Walkthrough today | Gap |
|---|---|---|
| Compact setup that collapses once the run is underway | TWO always-expanded fieldsets: "Course and walkthrough" (course, module, notes, screen-share disclosure) + "Draft format and options" (4-row paste box, label, Save/Browse, exemplar picker, THREE toggles) `[READ AnnouncementCourseFieldset.tsx:134-285]`. Nothing ever collapses. | **The whole setup stack sits between the top and the draft/Post on EVERY post-capture interaction.** This is the single largest scroll cost and the primary thing the ask targets. |
| Sticky dock, primary action at the bottom, reachable with 0 scroll | A sticky-TOP run bar (`runBarSticky`, `top: 0`) holds Start/Stop, probe, and the two Generate buttons `[READ :656-690]`. The IRREVERSIBLE primary (Post) is per-slot, deep inside a tall draft, NOT docked `[READ AnnouncementDraftSlot.tsx:269-293]`. | Start/Generate are reachable (sticky top), but they are at the TOP, not the chat's bottom dock, and the run bar is NESTED inside the collapsible setup (section 4), so it cannot survive a setup collapse as-is. |
| Growing stream between setup and dock | Draft slots live in an "Announcement drafts" `<fieldset>` `[READ :751-792]` below the run bar. | Shape-compatible already; reskinning its container to `annChat` vocabulary is lower-value (deferred, F-STREAM). |

**The run bar is a CHILD of `AnnouncementCourseFieldset`.** The panel passes it
as `children`, rendered between the fieldset's two inner `<fieldset>`s
`[READ WalkthroughAnnouncementPanel.tsx:652-747` and `AnnouncementCourseFieldset.tsx:182]`.
This coupling is pinned (`walkthrough-announcement.structure.test.ts:715-736`:
"two fieldsets, with {children} between" and "Start is a child of the fieldset
mount"). **Consequence that drives the whole wave: you cannot collapse the setup
without first LIFTING the run bar out of the collapsible region** - otherwise a
collapse hides Start/Generate too.

---

## 4. THE SHAPE DECISION (this seat's job)

"Mimic the llm chat grading view" + "minimize clicks / click-distance /
scroll-distance" maps onto the walkthrough's RECORD-then-DRAFT flow as THREE
concrete moves. M1 and M2 are the distance win; M3 is the enabling restructure
they both require.

### M3 (enabling): detach the run bar from the collapsible setup

The run-bar JSX (Start/Stop, probe, both Generate) and the capture status/hints
ALREADY live in the panel `[READ WalkthroughAnnouncementPanel.tsx:656-690]`; they
are only PASSED as `children` into `AnnouncementCourseFieldset`, which renders
them between its two inner fieldsets `[READ AnnouncementCourseFieldset.tsx:182]`.
M3 removes that `{children}` plumbing so the run bar renders directly in the
panel body as a sibling of the (now collapsible) setup and the drafts;
`AnnouncementCourseFieldset` becomes PURE setup (its two input fieldsets + the
G4 disclosure + the `collapsed ? summary : inputs` branch, no run-bar slot).
**No JSX moves between files** - the panel KEEPS the run-bar markup and only drops
the wrapper handoff. This is required by both M1 and M2 and is why the write set
includes the fieldset file and the re-pinned tests.

### M1 (the dominant scroll win): COLLAPSE the setup once a run is underway

Mirror the chat's `sessionReady` collapse, and mirror HOW it is structured: in
the chat the collapse is a branch INSIDE the setup region
(`GradingChatPanel.tsx:468-469`, the `) : ( <p setupSummary> )` of the
`!sessionReady` ternary), while the screen-is-not-saved disclosure stays OUTSIDE
that branch, in the always-rendered `sessionBar`
(`[READ GradingChatPanel.tsx:505]`, inside the `sessionBar` at `:502-513`, never
inside the ternary). Apply that same structure here. The walkthrough's analog of
"the session is established" is **a run is underway**: `capturing || hasMaterial`
(`hasMaterial = legibleBlockCount > 0`, `[READ :397]`).

**Mechanism (ONE place, in the fieldset file).** Give `AnnouncementCourseFieldset`
a `collapsed` prop (plus an `onExpand` callback); the panel computes `collapsed`
from the `isSetupCollapsed` leaf (AC-4) and passes it down. When `collapsed`,
the component hides its TWO input fieldsets and renders instead ONE
`annChat.setupSummary` strip ("Course: {name} - Module: {label}" + a "Change
setup" text button that calls `onExpand`, which sets the panel's
`manuallyExpanded` override). The panel does NOT wrap the whole
`<AnnouncementCourseFieldset>` in a conditional and swap it for a summary - the
`collapsed ? summary : inputs` branch lives INSIDE
`AnnouncementCourseFieldset.tsx`, which is what makes the G4 pin below buildable
in that same file. Expanded by default (fresh panel / after reload, where no run
exists).

**Guard G4 (screen-share disclosure) must render before EVERY reachable Start,
and the mechanism must make that provable - it is NOT "preserved by
construction" for free.** The disclosure
(`AnnouncementCourseFieldset.tsx:176-179`, "Frames from your screen are sent to
a third-party AI provider...") sits inside the first input fieldset today and
renders unconditionally. Under M1 it must be moved OUT of the collapsible input
region to a position that is (i) still inside `AnnouncementCourseFieldset.tsx`,
(ii) ABOVE/OUTSIDE the `collapsed ? summary : inputs` branch, and (iii) gated
only on `!capturing`. Why this is load-bearing and not cosmetic - the second-run
case: after run 1 (every slot posted) and before the second Start, `capturing`
is false but `hasMaterial` is still true (`legibleBlockCount` is reset only
INSIDE `handleStartStop` on the NEXT Start, `[READ :514-518]`), so the collapse
predicate is TRUE under BOTH F-COLLAPSE-TRIGGER readings; with the run bar
detached (M3) and docked (M2), Start is reachable, and clicking it fires a FRESH
`getDisplayMedia` picker (`[READ :519-525]`). If the disclosure were inside the
collapse branch it would be GONE at that moment - a real, unrecoverable privacy
defect. Rendering it OUTSIDE the branch gated on `!capturing` shows it before the
FIRST Start (nothing captured yet -> expanded anyway) AND before the SECOND (not
capturing -> rendered regardless of the input collapse). Its byte-frozen G4 text
and slice stay in this file; AC-3 re-pins it to require the disclosure outside
the collapse branch, with a red-then-green sabotage (move it inside -> red).

Collapse state is DERIVED (from in-memory `capturing`/`hasMaterial` via
`isSetupCollapsed`) plus a transient `manuallyExpanded` override in the panel; it
is **not persisted and needs no new `ta-` key** (section 6 justifies this against
persist-UI-control-state).

### M2 (chat parity for the primary action): relocate the run bar to a sticky BOTTOM dock

Once lifted (M3), place the run bar at the BOTTOM of the panel as a sticky dock -
`position: sticky; bottom: 0`, the chat's own `stickyComposer` mechanism. **This
is viable here specifically because the walkthrough panel is a bare
display-toggled sibling in `.tabContainer` (`page.tsx:789`), the SAME scroll
ancestor as the chat's composer (`page.tsx:771`), and `.tabContainer` is
`overflow: clip`, not a scroll container `[READ page.module.css:24-26]`** - so a
sticky-bottom sticks against the viewport exactly as the chat's does. The
TakeAnnouncement caveat (`.dock` had to be STATIC because its ancestor is
TabShell, `announcement-chat.module.css:93-96`) does NOT apply to this panel.

Resulting top-to-bottom order (chat-parity): title -> collapsed setup summary
(or expanded setup) -> capture status -> drafts STREAM -> **sticky bottom dock:
Start/Stop / Generate announcement / Generate video script**. Start enters the
dock; Stop replaces it; Generate sits beside it - the phase-appropriate primary
is always at the bottom, zero scroll, exactly like the composer.

**The irreversible Post stays a per-slot confirm, NOT docked.** Faithful to the
chat (whose per-row Post lives in the result row, not the composer) and required
by the brief's paramount ("the Post-to-students confirm MUST survive"). The
existing `scrollIntoView({ block: "nearest" })` on draft completion
`[READ AnnouncementDraftSlot.tsx:106-111]` already brings a fresh draft into
view; M1 pulls it up near the top. Do NOT add a second Post site - the prior
clicks scope explicitly rejected a sticky Post bar ("a second place to post is a
second place to misclick", `docs/walkthrough-announcement-clicks-scope.md:397`),
an owner-level decision this seat does not reopen.

### Considered and NOT proposed

| Idea | Why not |
|---|---|
| Dock the Post (single-slot) into the bottom bar | Removes/duplicates the only barrier before an unrecallable publish; violates the brief's paramount and the prior "second place to misclick" decision. |
| Keep the run bar sticky-TOP (no M2 relocation) | Lower chat parity; the brief describes a bottom action bar. Offered as fork F-DOCK (its only cost is one re-pin). |
| LOCK setup after collapse (like the chat locks the rubric) | A behaviour change: course/module/notes feed per-batch extraction and the draft `[READ :342-347,429-442]`; locking them mid-run is not requested and risks a stale-context regression. Collapse is visual only; "Change setup" always re-expands. |
| Persist the collapse state under a new `ta-` key | The run state it derives from is itself in-memory and lost on reload, so on reload setup correctly re-expands; a persisted collapse would desync from that. Keeps the 6-key canary intact. |
| New CSS module | Unneeded: reuse `annChat.setupSummary` (already imported) and one new class in the existing `WalkthroughRunBar.module.css`. `page.module.css` is frozen. |

---

## 5. Click and scroll cost

### 5.1 Clicks - the shape adds NONE and removes a scroll-driven re-click

The returning-instructor path is already near its click floor (prior clicks
scope: 5 in-app clicks, or 4 with auto-draft, `docs/walkthrough-announcement-clicks-scope.md:33`).
Auto-draft is default ON `[READ useWalkthroughSetup.ts:126]`, so after Stop a
draft appears with no Generate click. **M1/M2/M3 change NO click count** - they
remove SCROLL, not clicks. The one click-adjacent win: with setup collapsed, the
draft and its Post are not separated from the top by the setup stack, so the
instructor does not scroll-hunt (a scroll is not a click but is the co-equal
dimension). "Change setup" adds exactly 1 click ONLY when an instructor chooses
to edit setup mid-run - an opt-in, off the default path.

### 5.2 Scroll - current post-capture stack above the draft `[ESTIMATE]`

After Stop (auto-draft ON), to review+Post the draft the instructor scrolls past,
today, the entire "Draft format and options" fieldset that sits between the run
bar and the drafts: a 4-row paste box (~110px), label row (~38), Save/Browse row
(~31), three toggles (~38), plus the collapsed-but-present capture fieldset
content above. `[ESTIMATE]`, derived as in the prior scope (globals.css tokens,
MUI small field ~37.7px). Order of magnitude: ~300-450px of dead scroll past
controls that were set BEFORE capture, on every post-capture interaction.

### 5.3 Scroll after M1 `[ARITHMETIC over 5.2]`

Collapsed setup = one `annChat.setupSummary` strip (`padding: var(--space-3)
var(--space-4)` + one line, ~44px, `[READ announcement-chat.module.css:46-58]`).
The ~300-450px setup stack is replaced by ~44px. The draft sits directly under
the capture status. The dock keeps the phase-primary at the bottom (0 scroll)
regardless of draft height.

### 5.4 OWNER INSTRUMENT (replaces every `[ESTIMATE]`; this is the real test)

In the browser console on Tools > Announcements > "From a walkthrough", before
and after the build, at 1280x720 and 1366x768:

```js
const p = document.querySelector('[data-ta-view="walkannounce"]') || document.body;
const pt = p.getBoundingClientRect().top + scrollY;
const want = /^(Start capture|Stop capture|Generate announcement|Post to Canvas|Confirm post)$/;
[...p.querySelectorAll('button,[role=combobox],input,textarea')]
  .filter(e => e.offsetParent)
  .map(e => [(e.getAttribute('aria-label')||e.textContent||e.tagName).trim().slice(0,28),
             Math.round(e.getBoundingClientRect().top+scrollY-pt),
             want.test((e.textContent||'').trim())]);
```

Record each primary control's offset from the panel top, before vs after, run
once pre-capture, once with material captured, and once after a draft lands.

---

## 6. persist-UI-control-state and the diagnostics decision

**persist-UI-control-state:** the only new interactive affordance is the "Change
setup" expand/collapse toggle. It is NOT persisted, and that is correct here: the
collapse is derived from in-memory run state (`capturing`/`hasMaterial`) that
itself does not survive a reload (material and drafts are in-memory,
`beforeunload`-guarded only, `[READ walkthrough-run-decisions.ts:57-63]`), so on
reload there is no run and the setup must re-expand anyway. Persisting a collapse
flag would desync from that and is explicitly rejected. No new `ta-` key; the
6-key canary (`:107-114`) stays `toBe(6)`.

**Diagnostics representation (DEV_LOOP b907ff8e, owner 2026-10-11):** NO new
diagnostic, and here is the justification the rule requires. M1/M2/M3 add no new
data path, no new server action, no new network egress, no new persisted shape,
and no new failure mode: the collapse is derived local UI state; the dock
relocation is a className/position change; the run bar's buttons call the SAME
existing handlers. Every existing failure surface is preserved and visible -
capture errors, dropped frames, stalled capture, draft errors, post errors,
research/auto-draft status (`[READ WalkthroughAnnouncementPanel.tsx:579-598,
720-746]` and `AnnouncementDraftSlot.tsx:194-198,252-267`). This is a pure
presentational reshaping of an existing flow, so per the rule it legitimately
carries no diagnostic - stated, not assumed.

---

## 7. LEVERAGE NOTE

Per `docs/loop/leverage.md`: this is a **click-cost / scroll-cost change on an
existing capability, named as such** - the STRUCK "Click cost" class
(`leverage.md:66`), not a categorical advantage over a chat. Today the instructor
scrolls past a setup stack they already filled to reach the draft and its Post,
on every post-capture interaction; after this they do not. A chat cannot do the
walkthrough's capture/draft/post at all, but this change claims nothing
categorical - it claims only shorter cursor and scroll paths on a flow that
already exists. Acceptance criteria carry **no leverage claim** (fired trigger:
"look/UX change on an existing surface, no new user-reachable capability",
`seats.md` AC brief). Its removal test is OWNER-walk only (AC-9): nothing in this
repo renders a component or observes a pixel or a scroll (`this-repo.md` section
6), so no machine removal test is buildable - recorded as residual R-5.

---

## 8. ACCEPTANCE CRITERIA

MACHINE = a source-text / CSS-structure test can pin it (nothing renders). OWNER
= only a browser can show it. Per `docs/loop/traps-spec.md` every pass condition
names the object, the instrument, and the direction of failure.

| ID | Criterion | Object compared | Instrument | Direction of failure | Tag |
|---|---|---|---|---|---|
| AC-1 | The run bar (Start/Stop + both Generate) is a SIBLING of the setup block and the drafts in the panel body, NOT a child of `<AnnouncementCourseFieldset>` | `WalkthroughAnnouncementPanel.tsx` JSX structure | structure test: the run-bar wrapper (the `<div>` holding "Start capture") is NOT between `<AnnouncementCourseFieldset` and `</AnnouncementCourseFieldset>` | RED if the run bar is inside the fieldset mount | MACHINE |
| AC-2 | `AnnouncementCourseFieldset` takes a `collapsed` prop; when `collapsed` it hides its TWO input fieldsets and renders ONE `annChat.setupSummary` strip (with a "Change setup" control calling `onExpand`); the G4 disclosure still renders; the run bar is a panel-body sibling, not re-mounted by this branch | `AnnouncementCourseFieldset.tsx` render branches | structure test over THAT file: a `collapsed ? ... : ...` (or equivalent `collapsed &&`/`!collapsed &&`) branch exists; the summary side references `annChat.setupSummary`; the two input `<fieldset>`s sit on the inputs side of that branch | RED if no collapse branch exists, the summary side is missing, or an input fieldset renders unconditionally | MACHINE |
| AC-3 | The screen-share disclosure is rendered OUTSIDE the collapse branch, gated only on `!capturing`, so it shows before every reachable Start (incl. the second run); its G4 byte-frozen text is unchanged | `AnnouncementCourseFieldset.tsx` (the disclosure AND the collapse branch now in the SAME file - that is what makes this buildable) | structure test in that file: the disclosure anchor ("Frames from your screen") index is LESS than the `collapsed ?` branch index (disclosure above/outside it), AND the disclosure render is guarded by `!capturing`; red-then-green sabotage = move the disclosure inside the collapse branch -> red. Plus the existing G4 slice re-run | RED if the disclosure sits inside the collapse branch, is not `!capturing`-gated, or its text changed | MACHINE + OWNER |
| AC-4 | The collapse predicate is a pure function returning collapsed ONLY when `(capturing OR hasMaterial)` AND no manual-expand override; expanded otherwise | a new pure leaf (e.g. `isSetupCollapsed`) over a table | unit test, one row per input combination, EVERY row asserted | RED if any row disagrees (esp. collapsed while no run exists) | MACHINE |
| AC-5 | The run-bar wrapper carries a class whose OWN rule is `position: sticky` with a BOTTOM offset (F-DOCK = relocate) OR a TOP offset (F-DOCK = keep); the class is imported from `WalkthroughRunBar.module.css` | the run-bar `<div>` className + the resolved CSS rule | the existing `W3-F-STICKY` pin at `walkthrough-announcement.structure.test.ts:761-787`, UPDATED to the chosen offset direction | RED if the rule is not `position: sticky`, or the offset direction does not match the chosen fork | MACHINE |
| AC-6 | The run bar holds NO irreversible control; Post stays a per-slot `ConfirmArmButtons` | the run-bar slice; the slot | existing `:756-758` ("bar holds no Post control") + slot's `ConfirmArmButtons` count 2 (`:946`) | RED if any Post/Confirm/`ConfirmArmButtons`/`postWalkthroughAnnouncementAction` appears in the run bar, or the slot's count drops | MACHINE |
| AC-7 | Exactly 6 `ta-rec-wta-*` keys; no new persisted key | directory key canary | `walkthrough-announcement.structure.test.ts:107-114` `toBe(6)` | RED if a 7th key appears or one is removed | MACHINE |
| AC-8 | Every `annChat.*`/`runBar.*`/`styles.*`/`controls.*` reference resolves; orphan ratchet unchanged; no new dialog site | the edited files | `page-module-css-classes.test.ts`, `page-module-css-orphan-classes.test.ts` (re-measure the pinned ceiling at the gate, do not quote it), `modalAdoption.wiring.test.ts` | RED if a reference does not resolve, the orphan count rises above its pin, or a new dialog marker appears | MACHINE |
| AC-9 | THE FELT SHAPE: the two surfaces read as one system; post-capture, the draft and its Post sit under the collapsed setup with no dead-scroll past format/options; the phase-primary sits in the bottom dock reachable with 0 scroll; capture/draft/post works end to end | the instructor's real session, both surfaces side by side | owner runs the 5.4 snippet and walks the flow on a deployed build, light + dark, 1280/1366/375 | RED if the setup does not collapse, the dock is unreachable without scroll, a guard is lost, or the flow breaks | OWNER |
| AC-10 | No file in the write set exceeds 1000 lines; the panel ends <= 1000 | `@(Get-Content <f>).Count` + `file-size-ceiling.structure.test.ts` | both | RED if any exceeds (panel is 840 now; M3 drops plumbing, M1 adds the collapse-prop pass, `manuallyExpanded` state and `isSetupCollapsed` call - a modest NET GROWTH on the panel, far under 1000; the summary/disclosure branch grows the fieldset file; re-measure at the gate) | MACHINE |
| AC-11 | Behaviour-preservation: the draft/capture/post flow, the markdown-safe poster, the two-fieldset setup body, the video-script region text, and the hooks are unchanged | the existing walkthrough suite | `npm run test:paths` over the W1 gate list (section 9); timing/unload/slot tests re-run checked-safe | RED if any existing pin fails | MACHINE |

Numeric notes: no numeric target is asserted as a felt count - the distance
figures in section 5 are `[ESTIMATE]`/`[ARITHMETIC]` and the owner instrument
(5.4) replaces them; the MACHINE criteria pin the MECHANISM (collapse predicate,
sticky offset, run-bar location) that produces the shorter path, never a pixel.

---

## 9. WAVE PLAN

One wave; everything is inside `src/app/components/walkthrough-announcement/`
plus its one reused `recording/` CSS import, disjoint from the grading-chat and
take-announcement file sets, so no concurrency bar against other chat work. Order
inside the wave: pure leaf -> wiring -> surface, and the wave includes the file
that CALLS the new leaf.

**W1 - the shape.** Write set (exact paths):

- NEW `walkthrough-announcement/walkthrough-setup-collapse.ts` (~25 lines) +
  `.test.ts` (~60): the pure `isSetupCollapsed({capturing, hasMaterial,
  manuallyExpanded})` predicate (AC-4). A pure leaf like
  `walkthrough-run-decisions.ts`; its CALLER is the panel in this same wave
  (not shipped alone - `traps-spec.md`: a leaf with no caller is dead with every
  gate green).
- `walkthrough-announcement/WalkthroughAnnouncementPanel.tsx` (EDIT): remove the
  `{children}` handoff so the run bar + capture status render directly in the
  panel body (M3 - the run-bar markup STAYS in this file, only the wrapper
  handoff is dropped); add `manuallyExpanded` state, call the `isSetupCollapsed`
  leaf, and pass `collapsed` + an `onExpand` callback to
  `<AnnouncementCourseFieldset>` (M1); place the run-bar wrapper at the bottom as
  the sticky dock referencing the dock class (M2, F-DOCK-dependent). KEEP every
  hook call, every `ta-` key, every text string, the per-slot Post, the markdown
  poster path. The summary strip and the disclosure gating live in the FIELDSET,
  not the panel (so AC-2/AC-3 are buildable in one file).
- `walkthrough-announcement/AnnouncementCourseFieldset.tsx` (EDIT): remove the
  `children` run-bar slot; add a `collapsed` prop + an `onExpand` callback; when
  `collapsed`, hide the two input fieldsets and render the `annChat.setupSummary`
  strip + a "Change setup" button (-> `onExpand`); render the G4 disclosure gated
  on `!capturing` ABOVE/OUTSIDE the `collapsed ? summary : inputs` branch (the
  chat's own disclosure-outside-the-ternary shape, `GradingChatPanel.tsx:505`
  outside `:468-469`). Keep every control and the byte-frozen disclosure text.
- `walkthrough-announcement/WalkthroughRunBar.module.css` (EDIT): if F-DOCK =
  relocate, the sticky rule's offset becomes `bottom` (a new `.runBarDock`
  class referenced same-commit, or the existing rule flipped) - orphan-neutral,
  one new class in an existing module referenced in the same commit.
- `walkthrough-announcement/walkthrough-announcement.structure.test.ts` (EDIT,
  by the test seat): UPDATE the three pins this shape changes - `:715-736`
  (run bar between the two fieldsets / Start a child of the mount -> run bar is
  a panel-body sibling), `:761-787` (sticky TOP offset -> the chosen offset),
  and add AC-2/AC-3 collapse pins. FROZEN-ORACLE rule (memory: refactors disarm
  tests): the updated pins keep an independent literal expectation and a
  sabotage run must go red in the new location.

NOT in the write set: anything under `grading-chat/` or `recording/` except
`announcement-chat.module.css` (reused read-only) and the panel's existing
`RecordingControls.module.css` import; `AnnouncementDraftSlot.tsx` (F-STREAM /
R-CHILD deferred); the four hooks (logic untouched); `page.tsx` (the mount, out
of scope); `page.module.css` (frozen).

**Gate (the wave)** - one path per argument, never a raw multi-path `vitest`
(`test:paths` wrapper, `this-repo.md`):

```
npm run test:paths src/app/components/walkthrough-announcement/walkthrough-setup-collapse.test.ts src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts src/app/components/walkthrough-announcement/walkthrough-announcement-timing.structure.test.ts src/app/components/walkthrough-announcement/walkthrough-unload-guard.structure.test.ts src/app/components/walkthrough-announcement/useAnnouncementDraftSlots.test.ts src/app/components/walkthrough-announcement/AnnouncementDraftSlot.structure.test.ts src/app/components/courses/page-module-css-classes.test.ts src/app/components/courses/page-module-css-orphan-classes.test.ts src/app/components/tabs/topLevelTabs.wiring.test.ts src/app/components/ui/modalAdoption.wiring.test.ts src/file-size-ceiling.structure.test.ts src/source-bytes.structure.test.ts src/lib/no-emojis.test.ts
```

plus `npx tsc --noEmit` and `npm run lint` (exit 0, no NEW warning in the
written files) run by exactly one caller (they race on `tsconfig.tsbuildinfo`),
plus the `npm run build` compile-line check (the prerender tail failure is
expected, `this-repo.md`), plus `git status --short` against the write set and a
check that no `.claude/worktrees` copy was edited instead of the real tree.

**Seats / triggers for this chunk** (verifier rules each against the built diff):
Acceptance criteria - runs (no leverage claim, section 7). Visual/aesthetic -
RUNS (layout/surface change; the parity judgment and the real-anchor check that
the dock sticks against `.tabContainer`'s scroll context). User experience -
RUNS (re-walk the clicks; confirm the shape adds none). Accessibility - RUNS
reading-only (markup order: the collapse branch, the dock relocation; confirm
`role="status"`/`role="alert"` notices survive and the collapse introduces no
focus trap; no component renders). Architect+reuse - ran here. Test seat - runs
(owns the collapse predicate oracle and the re-pinned structure tests).
Data/storage - triaged OUT (no persisted shape; the collapse adds no key, section
6). Security, Reliability, Operability/admin - triaged OUT (no new egress/action/
model-text/failure-mode/owner-config). Recorded triggers for the OUT seats: none
fired.

---

## 10. The `owns` list (tests that READ an edited file as source text)

Command (PowerShell), output pasted:

```
Get-ChildItem -Recurse -Include *.test.ts -Path src | Select-String -List -Pattern "WalkthroughAnnouncementPanel|walkthrough-announcement/|AnnouncementCourseFieldset|WalkthroughRunBar|announcement-chat\.module\.css" | ForEach-Object { $_.Path.Replace((Get-Location).Path + '\','') }
```

```
src\app\actions\prompt-announcement-draft.test.ts
src\app\components\canvas-tab\announcements-panel.wiring.test.ts
src\app\components\canvas-tab\promptAnnouncementDraft.test.ts
src\app\components\canvas-tab\promptAnnouncementTemplate.test.ts
src\app\components\drafted-grades\classTrendsDraft.not-postable.test.ts
src\app\components\tabs\topLevelTabs.wiring.test.ts
src\app\components\walkthrough-announcement\useAnnouncementDraftSlots.test.ts
src\app\components\walkthrough-announcement\walkthrough-announcement-timing.structure.test.ts
src\app\components\walkthrough-announcement\walkthrough-announcement.structure.test.ts
src\app\components\walkthrough-announcement\walkthrough-unload-guard.structure.test.ts
src\lib\prompt-announcement-prompt.test.ts
src\lib\prompt-announcement-route.test.ts
src\tools\backlog\backlog-file.structure.test.ts
src\tools\vitest-paths\gate-commands.structure.test.ts
src\tools\strip-comments-agreement.structure.test.ts
```

Classification (the grep is a FLOOR, not the set - the implementer re-derives it
at the gate and reports what it missed, `traps-spec.md`):

- ADOPT (read an edited file as source; must stay green or be updated in-wave):
  `walkthrough-announcement.structure.test.ts` (the three re-pinned pins +
  AC-2/AC-3), `topLevelTabs.wiring.test.ts` (reads `page.tsx` mount - unchanged,
  confirm green), `page-module-css-classes.test.ts` /
  `page-module-css-orphan-classes.test.ts` (resolve the run-bar class + orphan
  ratchet), `modalAdoption.wiring.test.ts` (confirms the panel stays a
  non-dialog), `file-size-ceiling.structure.test.ts`,
  `source-bytes.structure.test.ts`, `no-emojis.test.ts`.
- RE-RUN CHECKED-SAFE (read the dir but assert on hooks/leaves untouched here):
  `useAnnouncementDraftSlots.test.ts`, `walkthrough-announcement-timing.structure.test.ts`,
  `walkthrough-unload-guard.structure.test.ts`,
  `AnnouncementDraftSlot.structure.test.ts` (slot not edited in W1).
- NOT THIS ITEM'S SOURCE (match "announcement" but concern other surfaces/
  actions, not these files' text): `prompt-announcement-draft.test.ts`,
  `announcements-panel.wiring.test.ts`, `promptAnnouncementDraft.test.ts`,
  `promptAnnouncementTemplate.test.ts`, `classTrendsDraft.not-postable.test.ts`,
  `prompt-announcement-prompt.test.ts`, `prompt-announcement-route.test.ts`.
- DOC/TOOL CANARIES (scan `docs/`/tooling, relevant only if THIS scope doc trips
  them): `backlog-file.structure.test.ts`, `gate-commands.structure.test.ts`,
  `strip-comments-agreement.structure.test.ts` - run `npm run docs:gate` on this
  doc's commit.

---

## 11. DISPOSITION TABLE (prior scope `walkthrough-announcement-chat-mimic-scope.md` -> this scope)

Ids re-derived LAST, after all renumbering.

| Prior requirement | Prior id | Disposition | Where it goes |
|---|---|---|---|
| Drop `.adaptPanel`, root -> `${styles.card} ${styles.form}` | F-FRAME | WITHDRAWN (CLOSED) | Shipped; tree confirms `WalkthroughAnnouncementPanel.tsx:571`. Discharged by the prior scope's build commit. Enforcer: none pinned it (nor needed - it is done). |
| `<h2>` -> `annChat.title` | F-TITLE | WITHDRAWN (CLOSED) | Shipped; `:572`. |
| Video-script region -> `annChat.latestCard` | F-PREVIEW | WITHDRAWN (CLOSED) | Shipped; `:797-798`. |
| Cross-import `announcement-chat.module.css` as `annChat` | F-CSS | WITHDRAWN (CLOSED) | Shipped; `:40`. Enforcer continues: `page-module-css-classes.test.ts` resolves it. |
| Panel-only vs panel+children scope | F-SCOPE | KEPT, re-decided | This scope IS the next activity; W1 is still panel + its one setup child (fieldset), draft-slot child deferred (F-STREAM). |
| Reskin draft previews/setup into chat vocabulary | R-CHILD | HANDED OVER -> F-STREAM / R-2 (this scope) | Lower-value for distance; deferred to a follow-up row, write set = `AnnouncementDraftSlot.tsx`. |
| Owner "to a T" parity walk | R-LOOK | KEPT, broadened -> AC-9 / R-1 | Now includes the new shape (collapse + dock), not just the skin. |
| Extract `announcement-chat.module.css` when a 3rd consumer needs it | R-EXTRACT | KEPT -> R-3 | Still a later refactor; this scope adds no third consumer (it reuses the same import). |
| Flow works end to end on a deployed build | R-FLOW | KEPT -> R-4 | Owner walk; broadened to cover the dock's sticky behaviour against `.tabContainer`. |
| Behaviour-preservation guard set (section 6) | - | KEPT as this scope's preservation baseline | Section 8 AC-6/AC-7/AC-11; the run-bar-sticky + fieldset pins are UPDATED (not dropped) because this scope deliberately changes that shape. |

No prior requirement is silently deleted: each is CLOSED (shipped), KEPT
(residual below), or HANDED OVER (named receiver + obligation).

---

## 12. RESIDUAL REGISTER (owner / instrument / step - each present, or it is a deletion; file each in `docs/BACKLOG.md` at disposal)

| ID | Residual | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R-1 | Whether the restyled panel reads "to a T" like the chat; the collapse and the bottom-dock look right; theme contrast of the dock in light+dark | repo owner (taste) | the 5.4 snippet + a side-by-side walk of both surfaces at 1280/1366/375, light+dark | the Verify owner-walk after W1 (AC-9) |
| R-2 (F-STREAM) | Reskin the draft-slot container to the chat `annChat.stream`/`latestCard` vocabulary | repo owner (scope) / follow-up implementer | a follow-up row, write set = `AnnouncementDraftSlot.tsx` | after W1, only if the AC-9 walk finds the drafts still read differently |
| R-3 (R-EXTRACT) | `announcement-chat.module.css` has two consumers (take + walkthrough); extract to a neutral module if a THIRD appears or strict locality is wanted | orchestrator (files the row) / next toucher | `grep -rln "announcement-chat.module.css" src` -> count importers | a later refactor row |
| R-4 (R-FLOW) | The capture/draft/post flow AND the new sticky bottom dock behave correctly end to end against `.tabContainer`'s scroll context on a deployed build | repo owner | owner walk on a deployed build (no `.env`/render here) | after W1 ships |
| R-5 | The click/scroll removal test is OWNER-only (no pixel/scroll observable under vitest) | repo owner | the 5.4 snippet, before vs after | the Verify step (AC-9); recorded because `seats.md`/Test seat require it when no machine removal test is buildable |
| R-6 | Whether a sticky BOTTOM offset actually sticks here (it is viable - same scroll ancestor as the chat, `page.module.css:24-26` - but unverified by render) | repo owner | owner walk; the F-DOCK fork answer | before W1 implements M2 |

---

## 13. COLLISIONS / disjointness

- Write set is `walkthrough-announcement/*` + one reused `recording/` CSS import.
  `git status --short` at authoring `[MEASURED]`: 23 untracked `docs/*-scope.md`
  files (the queue), no `src/` changes under `walkthrough-announcement/`,
  `grading-chat/`, or `recording/`. Exact-path intersection of this scope's write
  set with any in-flight `src/` edit is EMPTY; the canary (the write set against
  itself) is non-empty, so the instrument can see an overlap.
- Disjoint from every `grading-chat/` and take-announcement file: no shared path.
  `announcement-chat.module.css` is reused READ-ONLY (not in the write set), so it
  does not collide with any take-announcement work that owns it.
- Shared resources no file list shows: `npx tsc --noEmit` has one caller at a
  time (races on `tsconfig.tsbuildinfo`); no two agents sabotage on the tree at
  once; `docs/BACKLOG.md` belongs to the orchestrator.

---

## 14. FORKS (each shaped so every answer terminates the activity)

I have acted on my recommended reading in the wave plan (M1+M2+M3, F-DOCK =
relocate) and recorded it as MY reading, not an owner ruling. Nothing is built.

- **F-DOCK - run-bar position.** (relocate) lift to a sticky BOTTOM dock, chat
  parity, the brief's described shape [RECOMMEND]; (keep) lift but leave sticky
  TOP, lower parity, one fewer re-pin. Both require M3 (lift out) and both keep
  the per-slot Post. Cost if wrong: one CSS offset + one structure-test offset
  revert. Viability of (relocate) established: same scroll ancestor as the chat
  (section 4, `page.module.css:24-26`).
- **F-COLLAPSE-TRIGGER - when setup collapses.** (`capturing || hasMaterial`)
  [RECOMMEND] vs (`hasMaterial` only, so it stays expanded DURING capture). The
  recommend collapses during capture too (you are watching the screen, not the
  setup); the alternative keeps setup visible while capturing. Cost if wrong: one
  boolean in the pure predicate (AC-4). Either way the disclosure stays visible
  on `!capturing` (AC-3) and "Change setup" always re-expands.
- **F-STREAM - reskin the draft slots now or defer.** (defer) [RECOMMEND], as
  R-2 - it is lower-value for the distance ask and expands the write set to
  `AnnouncementDraftSlot.tsx`; (now) fold it into W1. Cost if wrong: a
  tightly-scoped follow-up row.

Each fork's answer is applied as transcription (AGENTS.md two-rounds rule) and
ends the activity; whatever is unresolved ships as a residual above.

---

## 15. What this seat could not determine; disposition

- Nothing here was seen rendered (no `.env`, no auth, no component renders -
  `this-repo.md` section 6). Every parity, collapse and sticky claim is a reading
  of source + tokens; the "to a T" verdict and the scroll figures are owner-walk
  (R-1, R-5, section 5.4).
- Whether the sticky BOTTOM dock actually sticks against `.tabContainer` is
  argued viable (same bare-sibling scroll ancestor as the chat) but not render-
  verified (R-6).
- HEAD short hash and every line count: re-measure at the wave gate; the prior
  scope's `81a148f1` figures are stale (panel was 841 there, 840 now).
- Disposition table: section 11 - this scope RESTRUCTURES
  `walkthrough-announcement-chat-mimic-scope.md`, whose skin shipped; it does not
  re-spec the shipped skin, it adds the distance-driven SHAPE.
- Round 1 of two: this artifact goes to a fresh `loop-checker` before any
  implementer reads it.
