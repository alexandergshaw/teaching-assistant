# WALKTHROUGH-ANNOUNCEMENT-CHAT-MIMIC - scope and wave plan (round 1)

Status: authored by the architecture/scoping seat (`loop-architect`). Recon +
element mapping + one-wave cut; NO production code, NO CSS, NO test was changed
by this seat. First authored version of this scope - it restructures no prior
artifact, so the disposition table is N/A (section 12).

Owner request (direct chat, 2026-10-07), verbatim: "the announcement from a
walkthrough needs to mimic the chat".

This is the SAME restyle just shipped for the take-announcement panel
(`ANNOUNCEMENT-VIEW-CHAT-MIMIC`, commit `8e073ee4`, template
`docs/announcement-view-chat-mimic-scope.md`) applied to the WALKTHROUGH
announcement panel. **It is a LOOK change, not a behavior change.** Every hook,
the draft/capture/post flow, the per-slot Post confirm, the run bar, the six
persisted `ta-` keys and the markdown-safe poster are preserved (section 6).

**Three of the take-announcement decisions INVERT here, each measured below:**
1. MOUNT CONTEXT inverts - the walkthrough panel is a BARE display-toggled
   sibling (like `GradingChatPanel`), not a `TabShell` child, so it matches the
   chat's OWN root instead of avoiding a frame (section 1, F-FRAME).
2. FOCUS ANCHOR inverts - the walkthrough panel has NO focus-on-open anchor at
   all (the take-announcement round-1 blocker does not exist here), so there is
   no focus constraint to preserve and none to invent (section 2).
3. CSS REUSE inverts - option (a) cross-import is RECOMMENDED here (it was
   rejected for take-announcement), because the module to import is the
   purpose-built announcement chat-mimic skin, not a feature-private one
   (section 5).

---

## 0. Measured quantities and the command that produced each

All commands run from repo root, this checkout, HEAD `81a148f1`
(`git rev-parse --short HEAD`), 2026-10-07. Re-measure every line count at the
wave gate with `@(Get-Content <f>).Count` (two tools disagree by 42 on one file
here, `this-repo.md`); the `wc -l` figures below are the authoring measurement.

| Quantity | Value | Command |
|---|---|---|
| `WalkthroughAnnouncementPanel.tsx` lines | 841 | `wc -l < src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx` |
| `TakeAnnouncementPanel.tsx` lines (shipped template) | 660 | `wc -l < src/app/components/recording/TakeAnnouncementPanel.tsx` |
| `announcement-chat.module.css` lines (the skin to reuse) | 103 | `wc -l < src/app/components/recording/announcement-chat.module.css` |
| `AnnouncementDraftSlot.tsx` lines (child; owns the per-slot Post) | 398 | `wc -l < src/app/components/walkthrough-announcement/AnnouncementDraftSlot.tsx` |
| Mount of walkthrough panel | `page.tsx:809`, inside a `<div style={{display: ... ? undefined : "none"}}>` bare sibling | `grep -n "<WalkthroughAnnouncementPanel" src/app/page.tsx` -> `:809`; wrapper read at `page.tsx:803-812` |
| Mount of the chat view (the target to mimic) | `page.tsx:791`, the SAME bare display-toggled sibling idiom | `grep -n "<GradingChatPanel" src/app/page.tsx` -> `:791` |
| The visible card surface both siblings sit in | `.tabContainer` = `background: var(--card-background); border: 1px solid var(--card-border); border-radius: var(--radius-xl); box-shadow: var(--shadow-lg)` | `page.module.css:14-27`; wrapper at `page.tsx:434` |
| `GradingChatPanel` root (what "mimic the chat" copies) | `<div className={`${styles.card} ${styles.form}`}>` | `GradingChatPanel.tsx:238` |
| `.card` definition | `padding: var(--space-6)`, flex column, gap `var(--space-6)`; NO border, NO background | `page.module.css:29-36` |
| `.form` definition | flex column, gap `var(--space-5)` | `page.module.css:99` |
| Walkthrough panel root TODAY | `<div className={styles.adaptPanel}>` + `.adaptPanelHeader`/`.adaptPanelTitle` (h2) / `.adaptPanelSubtitle` (p) | `WalkthroughAnnouncementPanel.tsx:570-573` |
| `.adaptPanel` definition | `padding: var(--space-5) var(--space-6); border: 1px solid var(--field-border); border-radius: var(--radius-lg); background: var(--field-background)` - a SELF-DRAWN bordered box on `--field-background` | `page.module.css:903-911` |
| Focus-on-open anchor in walkthrough panel | NONE | `grep -n "headingRef\|\.focus()\|tabIndex" .../WalkthroughAnnouncementPanel.tsx` -> no match (the only ref is `probeButtonRef`, a Button ref passed to `LegibilityProbeModal` as `restoreFocusRef` for MODAL close, not panel open; `:394,838`) |
| Post control location + idiom | per-slot `ConfirmArmButtons` ("Post to Canvas" / "Confirm post") in the CHILD | `AnnouncementDraftSlot.tsx:270-289`; the panel run bar "holds no Post or other irreversible control" (`WalkthroughAnnouncementPanel.tsx:656`) |
| Walkthrough panel is a dialog site | NO (no `role="dialog"`/`previewBackdrop`/`ModalShell`/MUI `Dialog`/`useModalDismiss` in the file) | `grep -n` for those markers in the panel -> none; not listed in `modalAdoptionScan.ts` |
| orphan ratchet pin | `PINNED_ORPHAN_CEILING = 118`; asserted `toBeLessThanOrEqual(118)` | `page-module-css-orphan-classes.test.ts:316,431` (rising above 118 reddens; falling below is an advisory message, `:428-429`, not a second assertion at this HEAD) |
| orphan ratchet scope | EVERY `*.module.css` under `src/` | `page-module-css-orphan-classes.test.ts` describe + `discoverStylesheets` (per the template scope section 12, re-confirmed) |
| `DIALOG_SITES.length` pin | `toBe(53)` | `modalAdoption.wiring.test.ts:353` |
| css-classes guard resolution | resolves every import to an ABSOLUTE PATH, matches by path not binding, covers EVERY `*.module.css` | `page-module-css-classes.test.ts:53-56` (header) |
| cross-dir CSS-import precedent FROM this panel | `import controls from "../recording/RecordingControls.module.css"` | `WalkthroughAnnouncementPanel.tsx:39` |
| file-size ceiling gate scope | repo-wide recursive, `LIMIT = 1000`, EXCLUDES `recording/` + `RecordingTab`/`TabShell` (those covered by `recording-split`) | `file-size-ceiling.structure.test.ts:41,52-58,102` |
| `recording-split.structure.test.ts` scope | `src/app/components/recording/` only (non-recursive) + two named files | `recording-split.structure.test.ts:76-93` - does NOT cover `walkthrough-announcement/` |

---

## 1. The MOUNT-CONTEXT decision (F-FRAME) - INVERTS the take-announcement case

**Measured fact.** The walkthrough panel is mounted at `page.tsx:809` inside a
bare `<div style={{display: ... ? undefined : "none"}}>` wrapper (`page.tsx:803-812`)
- the exact always-mounted, display-toggled TOP-LEVEL SIBLING idiom the chat
view uses at `page.tsx:791`. Neither is wrapped in `TabShell`. Both sit directly
inside `.tabContainer` (`page.tsx:434`), and **`.tabContainer` is the single
visible card surface** - it alone carries `background: var(--card-background)`,
`border: 1px solid var(--card-border)`, `border-radius: var(--radius-xl)` and
`box-shadow` (`page.module.css:14-27`). `.card` itself has NO border or
background (`page.module.css:29-36`); it supplies only the `var(--space-6)` inset
padding. So the chat view's "framed card" look = tabContainer's surface + the
chat panel's `.card`+`.form` inset padding. `GradingChatPanel`'s root is exactly
`<div className={`${styles.card} ${styles.form}`}>` (`GradingChatPanel.tsx:238`).

**The divergence today.** The walkthrough panel's root is
`<div className={styles.adaptPanel}>` (`:570`), and `.adaptPanel` DRAWS ITS OWN
bordered box on `var(--field-background)` (`page.module.css:903-911`). So today
the walkthrough panel is a nested bordered box, on a DIFFERENT surface token
(`--field-background` vs the chat's `--card-background` tabContainer), inside the
shared tabContainer - a double frame and a surface-token mismatch. That nested
box is the single biggest reason it does not read like the chat.

**DECISION / RECOMMEND (F-FRAME):** drop the self-drawn `.adaptPanel` box and
its `.adaptPanelHeader` wrapper, and set the root to
`<div className={`${styles.card} ${styles.form}`}>` - **identical to
`GradingChatPanel`'s root**. The frame then comes from the shared `.tabContainer`
exactly as it does for the chat, the inset padding matches (`--space-6`), and the
surface-token mismatch disappears.

This is the OPPOSITE of the take-announcement mimic, which had to AVOID adding a
frame (it was a `TabShell` child and a second `.card` would have double-framed).
Here the panel must MATCH the chat's bare-sibling root, not avoid it.

Note on `annChat.panel`: the shipped skin's `.panel` class
(`announcement-chat.module.css:10-15`, plain flex column, no padding) was built
for the take-announcement TabShell case where the padding came from TabShell.
Here, use `${styles.card} ${styles.form}` (not `annChat.panel`), because the
bare-sibling panel must supply its own `--space-6` inset the way the chat panel
does; `annChat.panel` would leave content flush against the tabContainer edge,
unlike the chat.

Alternative (kept, not recommended): keep `.adaptPanel` and only reskin inner
regions. Cost: the nested box + surface-token mismatch remain, which is the
chief thing that makes the two surfaces read differently. Cost if the
recommendation is wrong: one root className reverts.

---

## 2. The FOCUS-ANCHOR finding - there is NO anchor to preserve (INVERTS the blocker)

`grep -n "headingRef\|\.focus()\|tabIndex"` over
`WalkthroughAnnouncementPanel.tsx` returns NO match. The panel has no
focus-on-open effect, no heading ref, and no `tabIndex` on any heading. The only
ref in the file is `probeButtonRef` (`:394`), a `<Button>` ref passed to
`LegibilityProbeModal` as `restoreFocusRef` (`:838`) - that restores focus to the
probe BUTTON when the probe MODAL closes; it is unrelated to the panel's own
open, and it is not on the root/header being restyled.

**Consequence:** the take-announcement round-1 blocker (a `headingRef`
focus-on-open anchored to the title heading, which the frame drop would have
silently nulled) DOES NOT EXIST here. Dropping `.adaptPanelHeader`/the `<h2>` is
free of any focus constraint. There is therefore **no `M-focus` pin in this
scope, and the implementer must NOT invent a focus-on-open anchor** - adding one
would be an unrequested behavior change on a surface that never had it, and
nothing renders under vitest to prove it works anyway (`this-repo.md`: no
component is rendered by any test). The accessibility seat runs reading-only and
confirms the restyle introduces no focus regression and no gratuitous focus
addition (section 8).

---

## 3. The surface to restyle, as it is today

`WalkthroughAnnouncementPanel.tsx` (841 lines), a bare sibling at `page.tsx:809`.
It is already heavily extracted (`AnnouncementCourseFieldset`,
`AnnouncementDraftSlot`, four hooks), so the panel file owns the OUTER chrome and
two leaf regions; the setup fields and the per-draft previews live in children.

What the PANEL FILE owns (candidates for this restyle):
- Root `<div className={styles.adaptPanel}>` (`:570`) + `.adaptPanelHeader`
  (`:571`) + `<h2 className={styles.adaptPanelTitle}>` (`:572`) + a
  `.adaptPanelSubtitle` help paragraph (`:573-578`).
- The notices block (`:580-599`) - already uses `controls.notice` /
  `controls.noticeDanger` (shared vocab, identical to the chat).
- The sticky RUN BAR `<div className={`${styles.ghActions} ${runBar.runBarSticky}`}>`
  (`:657`) holding Start/Stop, the legibility probe, and the two Generate
  buttons - `position: sticky` with a top offset (pinned, section 6).
- Capture status / stalled / researching / auto-drafted hints (`:699-747`),
  already `controls.*`/`styles.fieldHint`.
- The "Announcement drafts" fieldset (`:752-793`) wrapping N
  `<AnnouncementDraftSlot>` children + "Add another draft slot".
- The "Video script draft" fieldset (`:797-836`) - a panel-owned read region
  (a `<TextField multiline>` + Copy/Download), NOT a child.

What CHILDREN own (out of this wave's write set - see R-CHILD, section 11):
- The course/module/notes setup fields: `AnnouncementCourseFieldset.tsx`.
- Each draft's preview + per-slot Post confirm: `AnnouncementDraftSlot.tsx`
  (`controls.draftPreview`, the `ConfirmArmButtons` Post at `:270-289`).

---

## 4. The element-by-element mapping (grading-chat -> walkthrough)

"Mimic the chat" is read as VISUAL/layout parity in the shared design LANGUAGE.
Each row says what maps, how, and the honest limit.

| grading-chat element | Walkthrough equivalent | Mapping | Parity |
|---|---|---|---|
| Framed single card (`${styles.card} ${styles.form}` on a bare sibling; frame from `.tabContainer`) | the panel root | **Drop `.adaptPanel`/`.adaptPanelHeader`; root -> `${styles.card} ${styles.form}`, identical to `GradingChatPanel.tsx:238`.** No focus anchor to preserve. | FULL (matches the chat's own root) |
| Uppercase-tracked light title (`annChat.title`) | the `<h2>` "Announcement from a walkthrough" | Restyle the `<h2>` to `annChat.title` voice (text unchanged); the help subtitle becomes `styles.fieldHint` or a lighter subtitle. | FULL (visual); the keep/lighten choice is owner-walk (R-LOOK) |
| Accent-rail read-only card for "the thing just produced" (`annChat.latestCard`/`latestCardLabel`/`latestCardText`) | the panel-owned VIDEO SCRIPT draft region (`:797-836`) | Wrap the script's read region in the `annChat.latestCard` idiom. The PER-DRAFT previews stay `controls.draftPreview` (child, already shared vocab) - reskinning them is R-CHILD. | FULL for the script; draft previews deferred |
| Sticky dock, hairline edge, primary action at bottom (`.stickyComposer`) | the RUN BAR (`${styles.ghActions} ${runBar.runBarSticky}`, `:657`) | Already a `position: sticky` primary-control bar (pinned, section 6). KEEP AS-IS; do NOT swap to `annChat.dock` (would break the `runBarSticky` structure pin). | FULL (already a sticky bar); hairline tweak lives in `runBar.module.css`, out of this file |
| Danger / warning notices (`controls.notice`/`noticeDanger`/`noticeWarning`) | the panel's existing notices (`:582-591,722`) | Already the identical idiom. No change. | FULL (already) |
| Status strip (`annChat.setupSummary`) | the per-slot "Posted to {course}" line | Lives in the CHILD (`AnnouncementDraftSlot.tsx:376`); N/A at panel level this wave (R-CHILD). | PARTIAL (child owns it) |
| Results STREAM / SegmentedToggle mode / "+ Add part" tray / harshness toggle | - | NO MAP - a draft-one capture flow, no submission stream, no modes, no parts, no grading harshness. | NONE |

**Net:** the dominant parity win is F-FRAME (drop the nested `.adaptPanel` box,
adopt the chat's bare-sibling `${styles.card} ${styles.form}` root on the shared
tabContainer surface), plus the `annChat.title` voice and the video-script
accent card. The sticky run bar is ALREADY the chat's dock idiom, and the
notices are ALREADY identical. The children already use shared `controls.*`
vocabulary. What cannot be "to a T" is the same four structures the
take-announcement scope recorded (stream, mode toggle, parts tray, harshness) -
they have no honest equivalent in a draft-one flow.

---

## 5. CSS-reuse decision: RECOMMEND (a) cross-import the shipped skin

**RECOMMEND (a) - import the EXISTING `recording/announcement-chat.module.css` as
`annChat` into `WalkthroughAnnouncementPanel.tsx`:**
`import annChat from "../recording/announcement-chat.module.css";` (binding
`annChat`, the proven-safe alias from the template).

This INVERTS the template scope's choice (it recommended (c) replicate and
rejected (a)). The inversion is sound because the two (a)'s are different
imports:

- In the template, (a) meant importing `grading-chat.module.css`, a
  FEATURE-PRIVATE module named for grading semantics (`sessionBar`,
  `stickyComposer`, `latestCard`) - reusing it in a recording panel would leak
  another feature's vocabulary. Correctly rejected.
- Here, (a) means importing `announcement-chat.module.css` - the PURPOSE-BUILT
  announcement chat-mimic skin, generically named, already consumed by one
  announcement panel (`TakeAnnouncementPanel`). The walkthrough panel is the
  SECOND announcement panel wanting the same skin. Importing the announcement
  skin into a second announcement panel is reuse of the asset built for exactly
  this, not a leak.

Why (a) over the others here:
- **Orphan ratchet: net-zero, automatically.** No new class is defined. Every
  class in `announcement-chat.module.css` is ALREADY referenced by
  `TakeAnnouncementPanel` (panel/title/setupField/setupSummary/latestCard/
  latestCardLabel/latestCardText/dock - verified in the shipped file), so none is
  an orphan today. Adding a SECOND referencer keeps them non-orphan; the global
  count stays 118 and `toBeLessThanOrEqual(118)` passes. (c) replicate would add
  ~6-8 freshly-defined classes that must each be referenced same-commit, plus a
  THIRD physical copy of the same token declarations.
- **The css-classes guard passes it.** That guard resolves every import to an
  absolute path and matches by path (`page-module-css-classes.test.ts:53-56`),
  covering every `*.module.css`, so each `annChat.X` reference from the
  walkthrough panel is checked to resolve to a class in the imported module.
- **The cross-dir import pattern is already established from this very panel.**
  `WalkthroughAnnouncementPanel.tsx:39` already imports
  `../recording/RecordingControls.module.css` cross-directory and passes all
  gates. A second cross-dir import to a `recording/` module is the same pattern.
- **It consolidates rather than re-replicates.** The template filed
  `RES-ACM-EXTRACT` (do the extraction when a third surface needs the skin).
  Consuming the existing module is the consolidating move; re-replicating would
  create the very duplication that rule-of-three warns against.

Alternatives:
- **(c) NEW walkthrough-side replica module: REJECT for this item.** A third copy
  of the same token-based declarations (grading-chat original -> recording
  replica -> walkthrough replica), a second drift surface, and ~6-8 new classes
  to reference same-commit. Only pays off if strict directory locality is
  required (R-EXTRACT).
- **(b) extract to a neutral shared module both import: REJECT for this item,
  keep as a follow-up (R-EXTRACT).** `announcement-chat.module.css` is ALREADY
  the neutral announcement skin; extracting means moving it (e.g. to
  `components/ui/`) and retargeting `TakeAnnouncementPanel`'s import - re-touching
  a shipped file for no functional gain in this wave. Do it only if a THIRD
  surface or a strict-locality decision arrives.

**Fork F-CSS:** (a) cross-import [RECOMMEND] vs (c) replica vs (b) extract. Cost
if (a) is wrong: a follow-up moves the module to a neutral directory and
retargets two imports (R-EXTRACT) - a mechanical refactor, no behavior risk.

---

## 6. Behavior-preservation guards (the LOOK must not regress the flow)

Each is an instrument that goes red if the restyle changes behavior. The object
under comparison, the instrument, and the failure direction are named.

| Behavior to preserve | Instrument | Direction of failure |
|---|---|---|
| NOT a dialog (no Escape-discards-draft) | `modalAdoption.wiring.test.ts` - `DIALOG_SITES.length` is `toBe(53)` (`:353`) | Introducing `role="dialog"`/`previewBackdrop`/`ModalShell`/MUI `Dialog`/`useModalDismiss` makes the panel a new dialog site -> the 53 pin breaks. The mimic introduces none (the chat is an inline panel; the restyle copies an inline surface onto an inline surface). `LegibilityProbeModal` (child, `ModalShell`-based) is untouched. |
| the sticky RUN BAR stays a sticky primary-control bar | `walkthrough-announcement.structure.test.ts:765-790` - the bar wrapper must reference `${<alias>}.runBarSticky` AND the `.runBarSticky` rule must hold `position: sticky` + a top offset | Replacing the run bar class (e.g. swapping in `annChat.dock`) or dropping `runBarSticky` reddens. KEEP `${styles.ghActions} ${runBar.runBarSticky}` (`:657`) exactly. |
| the run bar carries NO irreversible control; Post is a per-slot confirm | `AnnouncementDraftSlot.tsx:270-289` (`ConfirmArmButtons`, "Post to Canvas"/"Confirm post") - unchanged (child not in write set) | Downgrading the per-slot Post to a one-click action, or moving a Post into the run bar. Do neither. |
| markdown-safe poster + draft-slot seam + course fieldset wiring | `walkthrough-announcement.structure.test.ts` P1/G2/backlog-4.1 blocks (`:130-333`) - all read the panel as source text | Any of: dropping `postWalkthroughAnnouncementAction`, the `AnnouncementDraftSlot`/`AnnouncementCourseFieldset` mounts, the `useAnnouncementDraftSlots(...)` call, or importing `createAnnouncementAction`. A LOOK change touches none. |
| exactly six persisted `ta-` keys, exact set | `walkthrough-announcement.structure.test.ts:107` (directory-wide `ta-` key canary) | Adding/removing/typo-ing any `ta-rec-wta-*` token, even in a comment. A restyle adds no persisted key. |
| the video-script region's text/wiring | `walkthrough-announcement.structure.test.ts:511-527` ("Video script draft", "Generate video script", `"walkthrough-video-script.txt"`, "read aloud while", "re-recording") | Rewording/removing the script region while reskinning it. Keep the text; wrap it in `annChat.latestCard` only. |
| the hooks are not edited (logic stays put) | `useAnnouncementDraftSlots.test.ts`, `walkthrough-announcement-timing.structure.test.ts`, `walkthrough-unload-guard.structure.test.ts` - re-run checked-safe | Any hook edit. The restyle reformats JSX/classNames only. |
| panel < 1000 lines | `file-size-ceiling.structure.test.ts` (repo-wide; covers this file - it is NOT in `recording/`) | A restyle pushing 841 over 1000 (~159 headroom; a className-only change + one wrapper is far under). |
| page.tsx mount unchanged | `tabs/topLevelTabs.wiring.test.ts` + `walkthrough-announcement.structure.test.ts:44-62` | The mount/`active` prop changed - out of scope; `page.tsx` is not in the write set. |

NONE of these tests pins `.adaptPanel`/`.adaptPanelHeader`/`.adaptPanelTitle`/
`.adaptPanelSubtitle` or the title/subtitle text (verified: `grep -rn
"adaptPanel"` and the title text over all walkthrough + tab tests returns no
match), so dropping and restyling the root is safe against the existing suite.

---

## 7. Forks, each with a recommended reading

The owner's answer to any one ends the activity and is applied as transcription
(`AGENTS.md` two-rounds rule). None gates the rest of this scope.

- **F-FRAME (section 1) - root treatment.** RECOMMEND: drop `.adaptPanel`/
  `.adaptPanelHeader`, root -> `${styles.card} ${styles.form}` like
  `GradingChatPanel`. Alternative: keep `.adaptPanel`, reskin only inner regions
  (less parity; the nested box + surface-token mismatch remain). Cost if wrong:
  one root className reverts. (No focus constraint either way - section 2.)
- **F-CSS (section 5) - skin source.** RECOMMEND (a) cross-import the shipped
  `recording/announcement-chat.module.css` as `annChat`. Alternatives: (c) a new
  walkthrough replica, (b) extract to a neutral module. Cost if wrong: a
  mechanical follow-up move/retarget (R-EXTRACT).
- **F-TITLE - the `<h2>` + subtitle.** RECOMMEND: restyle the `<h2>` to the
  `annChat.title` voice (uppercase tracked, lighter), keep its text, and keep the
  help subtitle as `styles.fieldHint`. Alternative: keep the current
  `adaptPanelTitle`/`adaptPanelSubtitle` weight. This is the "to a T" taste lever
  (R-LOOK). Cost if wrong: one heading className. (Because there is NO focus
  anchor, this is a pure taste call - section 2.)
- **F-PREVIEW - which produced artifact becomes the accent-rail card.**
  RECOMMEND: the panel-owned VIDEO SCRIPT draft region (`:797-836`) in
  `annChat.latestCard`. Alternative / additive: ALSO reskin the per-draft
  previews (child `controls.draftPreview`) into the same idiom - that is R-CHILD
  and expands the write set to `AnnouncementDraftSlot.tsx`. Cost if wrong: which
  region gets the card class.
- **F-SCOPE - panel-only vs panel+children.** RECOMMEND: panel-only for W1 (the
  root de-nesting is the dominant parity win; children already use shared
  `controls.*` vocab). Alternative: fold `AnnouncementDraftSlot.tsx` +
  `AnnouncementCourseFieldset.tsx` into the same wave for `annChat.setupField`/
  `annChat.latestCard`/`annChat.setupSummary` parity. Cost if wrong: a
  tightly-scoped follow-up row (R-CHILD) touches those two files.

---

## 8. Wave plan - one wave, panel-only, CSS-first (no new CSS file)

Disjoint from every grading-chat file and every take-announcement file (this item
touches ONLY `walkthrough-announcement/WalkthroughAnnouncementPanel.tsx` and
reuses an existing module read-only), so it runs with no concurrency bar against
the chat efforts. No serialization dependency: the chat skin
(`announcement-chat.module.css`) and the chat view (`GradingChatPanel`) are
already shipped and settled.

**W1 - the mimic.** Write set (exact paths):
- `src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx`
  (EDIT only):
  - add `import annChat from "../recording/announcement-chat.module.css";`
  - root: `styles.adaptPanel` -> `${styles.card} ${styles.form}`; drop the
    `.adaptPanelHeader` wrapper (F-FRAME);
  - `<h2>`: `styles.adaptPanelTitle` -> `annChat.title` (text unchanged; NO ref,
    NO tabIndex, NO focus effect - section 2); subtitle -> `styles.fieldHint`
    (F-TITLE);
  - wrap the video-script draft read region in `annChat.latestCard` /
    `annChat.latestCardLabel` / `annChat.latestCardText` (F-PREVIEW);
  - KEEP `${styles.ghActions} ${runBar.runBarSticky}` on the run bar (`:657`),
    KEEP all `controls.*` notices, KEEP every text string and `ta-` token and
    every hook call.

**No new CSS file** (option (a), section 5). `announcement-chat.module.css` is
reused read-only and is NOT in the write set.

Not in the write set: `recording/announcement-chat.module.css` (reused as-is),
anything under `grading-chat/`, `page.module.css` (frozen - add no class there),
`RecordingControls.module.css` and `WalkthroughRunBar.module.css` (reused as-is),
`AnnouncementDraftSlot.tsx` and `AnnouncementCourseFieldset.tsx` (children -
R-CHILD follow-up), the four hooks (logic, untouched), `page.tsx` (the mount, out
of scope), any test file except a mimic pin the test seat elects to add.

Order inside the wave: (1) BEFORE screenshots of the walkthrough panel and the
chat view side by side (the parity baseline); (2) the import + root/title/script
reskin; (3) owner/preview iteration with the two surfaces side by side; (4) gate;
(5) AFTER screenshots attached to the verify report.

**Gate (the wave)** - one path per argument, never a raw multi-path `vitest`
(`test-paths` wrapper, `this-repo.md`):
```
npm run test:paths src/app/components/courses/page-module-css-classes.test.ts src/app/components/courses/page-module-css-orphan-classes.test.ts src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts src/app/components/walkthrough-announcement/walkthrough-announcement-timing.structure.test.ts src/app/components/walkthrough-announcement/walkthrough-unload-guard.structure.test.ts src/app/components/walkthrough-announcement/useAnnouncementDraftSlots.test.ts src/app/components/tabs/topLevelTabs.wiring.test.ts src/app/components/ui/modalAdoption.wiring.test.ts src/file-size-ceiling.structure.test.ts src/source-bytes.structure.test.ts src/lib/no-emojis.test.ts <any mimic pin the test seat adds>
```
plus `npx tsc --noEmit` and `npm run lint` (exit 0, no NEW warning in the written
file) run by exactly one caller (they race on `tsconfig.tsbuildinfo`), plus the
`npm run build` compile-line check (the prerender tail failure is expected,
`this-repo.md`), plus `git status --short` against the write set and a check that
no `.claude/worktrees` copy was edited instead of the real tree.

**Seats and triggers for this chunk** (verifier rules each against the built diff):
- Acceptance criteria: runs (always). NO leverage claim - this is a visual
  refactor of an existing surface to match the chat, not a new capability a user
  reaches (`DEV_LOOP.md` Criteria; `leverage.md`). Fired trigger recorded: "look
  change on an existing surface, no new user-reachable capability".
- Visual / aesthetic: RUNS (layout/surface change; the parity judgment and the
  real-anchor check that the root reads against `.tabContainer` are its work).
- User experience: RUNS (user-visible surface; re-walk the capture/draft/post
  clicks to confirm the restyle adds none).
- Accessibility: RUNS, reading-only (markup changes: the root frame, the title,
  the script card; no component renders, `this-repo.md`). Confirm the
  `role="status"`/`role="alert"` notices survive, and - section 2 - confirm the
  restyle neither regresses nor INVENTS a focus-on-open behavior.
- Test seat: runs (always); owns any mimic source-text pin (section 9).
- Architect + reuse: ran here (the module-reuse decision, the panel edit).
- Data/storage, Security, Reliability, Operability/admin: triaged OUT - no
  persisted shape, no new egress/action/model-text, no failure mode, no owner
  config; the restyle changes only presentation. Recorded triggers: none fired.

---

## 9. Machine-checkable vs owner-walk

**Machine-checkable (source-text/structure; none measures appearance):**
- M-class: every `annChat.X`/`styles.X`/`controls.X`/`runBar.X` reference in the
  panel resolves to a defined class (`page-module-css-classes.test.ts`).
- M-orphan: orphan count stays <= 118 (`page-module-css-orphan-classes.test.ts`);
  net-zero by construction - no new class is defined and every `annChat` class is
  already referenced by `TakeAnnouncementPanel`, so re-referencing keeps the count
  at 118.
- M-nodialog: `DIALOG_SITES.length` stays 53 and the panel appears on no dialog
  list (`modalAdoption.wiring.test.ts`).
- M-runbar: the run bar wrapper still references `${<alias>}.runBarSticky` and the
  `.runBarSticky` rule still holds `position: sticky` + a top offset (existing
  `walkthrough-announcement.structure.test.ts:765-790`). The restyle must not
  touch it.
- M-flow: the existing P1/G2/backlog-4.1/`ta-`-key/video-script pins all stay
  green (`walkthrough-announcement.structure.test.ts`).
- M-size: `WalkthroughAnnouncementPanel.tsx` < 1000
  (`file-size-ceiling.structure.test.ts`).
- M-bytes/emoji: `source-bytes.structure.test.ts`, `no-emojis.test.ts`.
- M-mimic (SUGGESTED, test seat's call): a source-text pin that the panel root is
  `${styles.card} ${styles.form}` (not `styles.adaptPanel`) and references
  `annChat.title` + `annChat.latestCard`, so a regression back to the nested
  `.adaptPanel` box reddens. Add it to the gate's `<mimic pin>` slot if authored.
- **NO M-focus pin** - unlike the take-announcement mimic, there is no
  focus-on-open anchor to pin (section 2), and inventing one is out of scope.

**Owner-walk ONLY (no `.env`, no auth, no rendered component - `this-repo.md`):**
whether the two surfaces actually READ as one design system; whether dropping
`.adaptPanel` and lightening the title (F-FRAME/F-TITLE) looks right; theme
contrast of the video-script accent card in light and dark; whether the sticky
run bar behaves against `.tabContainer`'s scroll context; and that the
capture/draft/post flow still works end to end on a deployed build. Recorded as
residuals (section 11), never filled in here.

---

## 10. The `owns` list (tests that READ an edited file as source text)

Command (PowerShell):
```
Get-ChildItem -Recurse -Include *.test.ts src | Select-String -List -Pattern "WalkthroughAnnouncementPanel|walkthrough-announcement/|announcement-chat|module\.css"
```
Measured result (classified; re-run at the wave gate for the full set):
- `src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts`
  - ADOPT (reads the panel as source; pins the run bar/`ta-`-keys/video-script/
    wiring - section 6; confirm all stay green).
- `src/app/components/walkthrough-announcement/walkthrough-announcement-timing.structure.test.ts`
  - re-run checked-safe (timing/schedule logic in children/hooks, untouched).
- `src/app/components/walkthrough-announcement/walkthrough-unload-guard.structure.test.ts`
  - re-run checked-safe (unload guard logic, untouched).
- `src/app/components/walkthrough-announcement/useAnnouncementDraftSlots.test.ts`
  - re-run checked-safe (slot hook, untouched).
- `src/app/components/tabs/topLevelTabs.wiring.test.ts` - ADOPT (reads `page.tsx`
  mount of the panel; the mount is unchanged, confirm it stays green).
- `src/app/components/courses/page-module-css-classes.test.ts` - ADOPT (resolves
  the new `annChat` import by path; every reference must resolve).
- `src/app/components/courses/page-module-css-orphan-classes.test.ts` - ADOPT
  (orphan ratchet across every `*.module.css`; net-zero expected).
- `src/app/components/ui/modalAdoption.wiring.test.ts` - ADOPT (the panel is a
  source it classifies; confirms it stays a non-dialog).
- `src/file-size-ceiling.structure.test.ts` - ADOPT (unconditional; covers this
  file).
- `src/source-bytes.structure.test.ts`, `src/lib/no-emojis.test.ts` - ADOPT
  (repo-wide byte/emoji canaries).

(The following also match the grep but are NOT in this item's write path and do
not read the edited file as source:
`src/app/actions/prompt-announcement-draft.test.ts`,
`src/app/components/canvas-tab/announcements-panel.wiring.test.ts`,
`.../promptAnnouncementDraft.test.ts`, `.../promptAnnouncementTemplate.test.ts`,
`src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts` -
they concern other announcement surfaces/actions, not this panel's source text.)

---

## 11. Residual register (owner / instrument / step - each present, or it is a deletion)

Each MUST be filed in `docs/BACKLOG.md` by the orchestrator at disposal; a
residual living only here does not exist (`DEV_LOOP.md` step 0).

| ID | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| R-LOOK | Whether the restyled panel reads "to a T" like the chat; the F-FRAME drop of `.adaptPanel` and the F-TITLE keep/lighten of the title; theme contrast of the video-script accent card | Repo owner (taste), W1 implementer driving | Before/after screenshots of the walkthrough panel AND the chat view at 1280/768/375, light+dark, side by side | W1 steps 1 and 3, then the owner walk |
| R-CHILD | Reskin the per-draft previews (`AnnouncementDraftSlot.tsx`, `controls.draftPreview` -> `annChat.latestCard` idiom) and the setup fields (`AnnouncementCourseFieldset.tsx` -> `annChat.setupField`/`setupSummary`) into the chat vocabulary, IF the owner walk finds they still read differently | Repo owner (scope decision) / a follow-up implementer | Owner walk (R-LOOK result); then a follow-up row with write set = those two child files | A follow-up wave after W1 ships |
| R-EXTRACT | `announcement-chat.module.css` now has TWO consumers (take + walkthrough). If a THIRD surface needs the skin, or strict directory locality is wanted, move it to a neutral module (e.g. `components/ui/`) and retarget both imports (supersedes the template's RES-ACM-EXTRACT, which is now one consumer closer to the rule-of-three) | Orchestrator (files the row) / next toucher | `grep -rln "announcement-chat.module.css" src` -> count importers; extract when a third appears | A later refactor row |
| R-FLOW | The capture/draft/post flow and the sticky run bar behave correctly end to end on a deployed build | Repo owner | Owner walk on a deployed build (no `.env`/render here) | After W1 ships |

---

## 12. What this seat could not determine; disposition

- Nothing in this document was seen rendered (no `.env`, no auth, no rendered
  component - `this-repo.md`). Every parity statement is a reading of source and
  tokens; the "to a T" verdict is an owner walk (R-LOOK).
- Whether the sticky run bar behaves against `.tabContainer`'s scroll context the
  way the chat's dock behaves against its own ancestor (R-FLOW) - the run bar is
  already shipped and pinned sticky, so this is not changed by this item; it is
  recorded as an owner-walk observation, not a new risk this wave introduces.
- Disposition table: N/A - first authored version of this scope; it restructures
  no prior artifact. The three inversions of the take-announcement decisions
  (mount context, focus anchor, CSS reuse) are each measured in sections 1, 2 and
  5 against this tree, not inherited from the template.
- Round 1 of two: this artifact goes to a fresh `loop-checker` before any
  implementer reads it.
