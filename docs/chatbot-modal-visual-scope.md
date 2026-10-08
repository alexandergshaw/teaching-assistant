# CHATBOT-MODAL-VISUAL - scope and recon (round 2, UNCHECKED)

Status: authored by the architecture (layout) + UX scope seat, revised in round
2 to apply a fresh `loop-checker`'s two blockers (B1 shared-class blast radius;
B2 the omitted CHATBOT-FORMALITY-SCALE write-overlap) plus minors M1/M3. Round 2
applies the check's corrective rules only; it reopens no design the check
confirmed sound. Goes to a fresh checker before any build. Recon and plan only:
no code, no CSS, no test was changed by this seat. The only filesystem side
effect of this seat's measurement run is `docs/css-orphans.md`, which the orphan
test rewrites by design and was already ` M` in the working tree before this
seat started (`git status --short docs/css-orphans.md` reads ` M` before/after).

Backlog row: `docs/BACKLOG.md` (CHATBOT-MODAL-VISUAL). Owner request,
2026-10-06, verbatim: "the chatbot modal needs an aesthetic overhaul." Taken as
LOOK-AND-FEEL only; the chat flow works and must not regress.

Current HEAD `f1eea4ff` (`git rev-parse --short HEAD`, round 2). The section-0
measurements and the 0.1 baseline gate were captured a few commits earlier at
`a8a9d61e`; re-measured at `f1eea4ff` in round 2, the three line counts are
unchanged (AiChatWindow 978, AiChatFab 943, page.module.css 7034) and the orphan
ratchet still passes `toBe(118)` (`npm run test:paths ...orphan-classes.test.ts`
-> `COVERED ... passed=9`). A build-time re-measure is required regardless, since
CHATBOT-FORMALITY-SCALE lands first (B2/section 6). Working tree dirty with
sibling `docs/` only; `git status --short src` empty at the gate run.

Round-2 revision log (what changed from round 1, so the fresh checker can audit
the delta rather than re-reading whole):
- B1: section 1.1, design R1/R3/R4-close, section 4.1, AC8/AC9, RES-1/RES-2 now
  carry the MEASURED 3-surface blast radius of the shared frame/header/context
  classes. D1+D3 stay shared (strict improvements); D4 (close icon) is scoped to
  AiChatWindow only via a new non-shared modifier class.
- B2: section 6 now lists CHATBOT-FORMALITY-SCALE as WRITE-OVERLAPPING (same
  `.tsx` files + same orphan ratchet), requires serialization, and fixes the
  order (formality FIRST). R2 meta-zone now accounts for a `FormalityStrip`
  beside `ResponseModeStrip`.
- M1: HEAD re-cited (f1eea4ff). M3: dead `.chatModal*` decoy family called out
  (section 4.2).
- Confirmed SOUND and UNCHANGED (do not re-litigate): orphan ratchet stays 118
  via property-edits + MUI `sx`; ceiling exemption of `.css` + the icon-extraction
  contingency; the wiring/source-text pins (section 5); D1-D6 inventory accuracy;
  one wave; no leverage claim.

Disposition table (round-2 restructuring touches no PRIOR requirement's identity
- every round-1 AC/RES keeps its id; the changes are additive scope corrections
within the same ids). Mapping:

| Round-1 item | Round-2 disposition |
|---|---|
| AC1-AC7 (machine pins) | KEPT, ids unchanged |
| AC8 (owner walk, FAB + selection chat) | KEPT, id unchanged; surface list WIDENED to 3 surfaces (B1) |
| AC9 (selection chat under Reading A) | KEPT, id unchanged; folded into AC8's widened list + restated |
| RES-1 (the LOOK) | KEPT; now names all 3 collateral surfaces (B1) |
| RES-2 (Reading A/B fork) | KEPT; narrowed - D1/D3 are no longer part of the fork (always shared), only D4 is FAB-scoped by construction |
| RES-3 (meta-zone depth) | KEPT; now includes the FormalityStrip (B2) |
| RES-4 (ceiling headroom) | KEPT, unchanged |
| (new) section 6 CHATBOT-FORMALITY-SCALE serialization | ADDED (B2) |

Seat triage for this chunk (fired triggers recorded):
- Architect + layout: RUNS (this seat). Decides where the frame/header/stream/
  dock seams fall and which object each restyle binds to.
- User experience / Visual / Accessibility: RUN as a combined reading pass
  (Wave 3) - any change a user sees; reading claims only, no component renders.
- Data / storage: N/A - no persisted shape changes (the voice-mode `ta:` key
  and positions are untouched; this is CSS + markup only).
- Operability / admin: N/A - nothing an owner configures/audits/revokes.
- Security: N/A - no new egress, no new prompt path, no new rendered model
  output sink (message text already renders through the existing path; this
  seat adds no `dangerouslySetInnerHTML` and none is proposed).
- Reliability: N/A - no stream/timeout/retry/job/resource change.

---

## The leverage question, answered

Asked per `docs/loop/leverage.md` and the architect non-negotiable. There is NO
leverage claim to make. This chunk builds no capability a user reaches that did
not exist yesterday - the FAB chat, the voice `ResponseModeStrip`, Enter-to-send,
the `@institution` typeahead, the knowledge-context strips and the tone chips
all already ship. The work changes only appearance. Per `DEV_LOOP.md` ("The loop
/ Criteria"), a visual-only restyle sits with refactors/bug-fixes/doc-corrections
in the "no claim" set. Fired trigger recorded: appearance-only, no new mechanism.
Do not manufacture a claim to fill the slot.

---

## 0. Measured quantities and the command that produced each

| Quantity | Value | Command |
|---|---|---|
| `AiChatWindow.tsx` lines | 978 | `@(Get-Content src/app/components/AiChatWindow.tsx).Count` (PowerShell); `wc -l` agrees (978) |
| `AiChatFab.tsx` lines | 943 | `@(Get-Content src/app/components/AiChatFab.tsx).Count`; `wc -l` agrees (943) |
| `page.module.css` lines | 7034 | `@(Get-Content src/app/page.module.css).Count`; `wc -l` agrees (7034) |
| `ResponseModeStrip.tsx` lines | 47 | `@(Get-Content src/app/components/chat/ResponseModeStrip.tsx).Count` |
| `InstitutionTypeahead.tsx` lines | 113 | `@(Get-Content src/app/components/chat/InstitutionTypeahead.tsx).Count` |
| File-size ceiling | `LIMIT = 1000`, scans `/\.(ts\|tsx)$/` only | `grep -n "LIMIT = 1000\|\\.(ts\|tsx)" src/file-size-ceiling.structure.test.ts` (`:41`, `:106`) |
| AiChatWindow headroom under ceiling | 22 lines (1000 - 978) | arithmetic on the two rows above |
| `.css` subject to the ceiling? | NO - `listSourceFiles` keeps only `.ts`/`.tsx` (`:106`) | same grep; `page.module.css` is structurally exempt |
| Orphan ratchet pin | `PINNED_ORPHAN_CEILING = 118`, asserted with `toBe` (not just `<=`) | `grep -n "PINNED_ORPHAN_CEILING =\|toBe(PINNED" src/app/components/courses/page-module-css-orphan-classes.test.ts` (`:316`, `:436`, `:455-456`) |
| Chat classes already ORPHANED (zero JS reference today) | 3: `.selectionChatInput`, `.selectionChatMsgAction`, `.selectionChatSend` | `grep -aiE 'selectionChat\|toneStatus\|institution\|attachment\|suggestion\|knowledgeContext' docs/css-orphans.md` |
| Chat CSS block in `page.module.css` | `:4062-4705` (`.selectionChatWindow` through `.suggestionBubble:hover`) | `grep -n "selectionChatWindow\|suggestionBubble" src/app/page.module.css` |
| Tests that read AiChatWindow.tsx / AiChatFab.tsx as source text | 7 (see section 5) | `grep -rlE 'readFileSync[^)]*AiChat(Window\|Fab)\|AiChat(Window\|Fab)\.tsx' src --include=*.test.ts` |

### 0.1 Baseline gate at HEAD (green) - the state the wave must return to

Command (PowerShell, repo root), one path per argument:

```
npm run test:paths src/app/components/courses/page-module-css-classes.test.ts src/app/components/courses/page-module-css-orphan-classes.test.ts src/app/components/chat/institutionTriggerWiring.test.ts src/app/components/chat/responseMode.wiring.test.ts src/file-size-ceiling.structure.test.ts src/source-bytes.structure.test.ts src/lib/no-emojis.test.ts
```

Wrapper output, quoted:

```
COVERED src/app/components/courses/page-module-css-classes.test.ts files=1 passed=10
COVERED src/app/components/courses/page-module-css-orphan-classes.test.ts files=1 passed=9
COVERED src/app/components/chat/institutionTriggerWiring.test.ts files=1 passed=19
COVERED src/app/components/chat/responseMode.wiring.test.ts files=1 passed=5
COVERED src/file-size-ceiling.structure.test.ts files=1 passed=4
COVERED src/source-bytes.structure.test.ts files=1 passed=3
COVERED src/lib/no-emojis.test.ts files=1 passed=18
Test Files  7 passed (7)   Tests  68 passed (68)
```

The orphan ratchet's `toBe(118)` assertion is inside the passed=9 above, so
`totalOrphanCount === 118` is confirmed at HEAD. This gate proves the STRUCTURE
of source and stylesheets; it proves nothing about how any of it looks
(`this-repo.md` section 2: no component is rendered by any test).

---

## 1. Current-state inventory - DOM and CSS, cited, and what does not look good

### 1.1 How the window is mounted and shared (the shape fact that drives everything)

`AiChatWindow.tsx` is a SHARED component. It is rendered by:
- `AiChatFab.tsx:859-894` - the app-wide FAB chat (`institutionTypeahead`,
  `responseMode`, `toneStatus`, knowledge strips all passed), and
- `SelectionChatWidget` - the text-selection chat, which passes NONE of the
  typeahead/responseMode props (the prop doc at `AiChatWindow.tsx:90-93` and
  `:125-126` records this: SelectionChatWidget "must render today's plain
  textbox byte-for-byte, no combobox role").

Every class the window uses is defined in `src/app/page.module.css` (import at
`AiChatWindow.tsx:12` `import styles from "../page.module.css"`; the
`../../page.module.css` spelling pinned by `institutionTriggerWiring.test.ts:74`
is `AiChatFab`/`InstitutionTypeahead`'s relative path - same file). The classes
are prefixed `selectionChat*` for historical reasons; they are NOT
selection-chat-only.

**Shape consequence (load-bearing - this is the SURFACE-is-a-layer call, and
the blast radius is WIDER than two mounts - corrected in round 2, B1).** The
`selectionChat*` frame/header/context classes are NOT used only by the two
`AiChatWindow` mounts. Measured per class (`grep -rlnE "styles\.<class>\b"
src --include=*.tsx`, round 2 at `f1eea4ff`):

| Class(es) | Consumers (all `.tsx`) |
|---|---|
| `.selectionChatWindow`, `.selectionChatHeader`, `.selectionChatHeaderLeft`, `.selectionChatClose` | `AiChatWindow.tsx`, `live-class/LiveClassWindow.tsx`, `courses/WeeklyChecklistOverviewModal.tsx` |
| `.selectionChatContext` | `AiChatWindow.tsx`, `chat/ResponseModeStrip.tsx`, `courses/WeeklyChecklistOverviewModal.tsx` |

So a property edit to the shared frame/header/hairline classes propagates to
THREE floating surfaces: the FAB chat (+ the selection chat, both via
`AiChatWindow`), the Live Class window, and the Weekly Checklist Overview modal.
`.selectionChatContext` additionally skins the `ResponseModeStrip` control.
Two sharp edges this creates, both handled in the design (R3 close, section 4.1):
- `LiveClassWindow.tsx:61-63` and `WeeklyChecklistOverviewModal.tsx:330-332`
  render a RAW `x` text glyph inside `.selectionChatClose`.
- `WeeklyChecklistOverviewModal.tsx:322-325` has a SECOND `.selectionChatClose`
  button whose `onClick` is `refresh` (a Refresh control holding a `<RefreshIcon/>`),
  NOT a close. Icon-button geometry applied to the shared `.selectionChatClose`
  would misrender the raw-`x` glyphs and restyle that Refresh button.

The frame/hairline improvements (D1, D3) are strict, token-only improvements and
all three windows getting them is acceptable and consistent (confirmed as the
design in R1/R3). The close-icon change (D4) is therefore scoped to
`AiChatWindow` ONLY, via a new non-shared modifier class, to avoid those two
regressions. See section 4.1 for the fork and the recommended reading.

### 1.2 DOM order of the window (AiChatWindow.tsx), region by region

Outer `div.selectionChatWindow` (`:615-624`, `role="dialog"`), children in order:
1. Two always-mounted live regions (typeahead only) - `:631-640`, visually
   hidden, not a visual concern.
2. Drag-drop overlay `.selectionChatDropOverlay` - `:646-654`, shown only mid-drag.
3. Header `.selectionChatHeader` / `.selectionChatHeaderLeft` + close button
   `.selectionChatClose` - `:657-669`.
4. Optional selection-context strip `.selectionChatContext` - `:672-676`.
5. Knowledge-context strip `.selectionChatContext + .toneStatusChip` with a
   `.knowledgeContextClear` button - `:685-703`.
6. Institution-load notice `.selectionChatContext` + `.institutionNoticeAction`
   - `:710-719`.
7. `ResponseModeStrip` (own file) - `:725`.
8. Tone chip `.selectionChatContext + .toneStatusChip (+ Active/Muted/Link)`
   - `:726-752`.
9. Message stream `.selectionChatMessages` with `.selectionChatEmpty`,
   per-message `.selectionChatMsgGroup` -> optional `.selectionChatMsgAttachments`
   -> bubble (`.selectionChatUserMsg` / `.selectionChatAiMsg`) -> action row
   (`.selectionChatMsgActionsUser` / `.selectionChatMsgActionsAi`, MUI
   `IconButton`s) -> typing `.selectionChatTyping` -> error `.selectionChatError`
   - `:755-821`.
10. Skipped-files notice `.attachmentSkippedNotice` - `:826-832`.
11. Suggestion bubbles `.suggestionBubbles` / `.suggestionBubble` - `:835-849`.
12. Pending attachment chips `.attachmentChips` / `.attachmentChip`(+Thumb) -
    `:855-889`.
13. Attach error `.selectionChatError` - `:891-895`.
14. Composer: `.institutionTypeaheadAnchor` (typeahead only) wrapping
    `.selectionChatInputRow` (`:546-612`), itself an MUI `IconButton` (attach) +
    MUI `TextField` + MUI `IconButton` (send). The `.selectionChatInput` /
    `.selectionChatSend` CSS classes are DEAD - MUI renders the real controls;
    these are two of the three orphans.

### 1.3 What does not look good - concrete, cited

- **D1 - The frame reads as an input field, not a card.**
  `.selectionChatWindow` (`:4071-4072`) uses `background: var(--field-background)`
  (the token for text inputs, `globals.css:26`) and an ad-hoc
  `border: 1px solid color-mix(in srgb, var(--text-primary) 12%, transparent)`.
  The house floating-surface language is the CARD: `--card-background` +
  `--card-border` (`globals.css:20-21`), as the grading overhaul's framed card
  and `.tabContainer` (`page.module.css:14-27`) both use. So the chat window is
  the one floating surface that is skinned as a giant input. This is the central
  token-drift fix.

- **D2 - The top of the window is a stack of near-identical full-bleed bands
  (the strongest "doesn't look good": density + hierarchy).** Items 4-8 above are
  each a full-width `.selectionChatContext` band (`:4149-4159`,
  `background: var(--surface-subtle)`, its own `border-bottom`). When a FAB chat
  is opened from the Knowledge tab with voice on and no tone sample, up to FOUR
  of these stack (knowledge strip + institution notice + ResponseModeStrip + tone
  chip), all the same muted background with hairline dividers, shoving the message
  area down and reading as undifferentiated noise rather than status. There is no
  chip/pill treatment grouping them; they are stacked rows.

- **D3 - Hairlines and header borders are ad-hoc color-mixes, not the
  `--border-soft` token.** Header (`:4113`), context strip (`:4154`), composer
  (`:4615`) and suggestion row (`:4678`) each hand-roll
  `color-mix(in srgb, var(--text-primary) 6-8%, transparent)` instead of the
  house hairline `--border-soft` (`globals.css:63`, redefined dark at `:296`).
  Four slightly different hairline values on one small surface.

- **D4 - The close control is a raw glyph, off the icon system.**
  `.selectionChatClose` renders a literal `x` at `--font-size-xl` (`:662-668`,
  `:4133-4142`) while every other control in the window uses real 16/20px SVG
  icons (the per-message copy/resend, the composer attach/send, `:933-978`). The
  header close is the one crude affordance.

- **D5 - Message density: actions are always-visible under every bubble.** Each
  message renders a persistent action row (`.selectionChatMsgActionsAi/User`,
  `:781-808`) with an MUI `IconButton` beneath the bubble, competing with the
  message and adding vertical weight to every turn. Group gap is only
  `--space-2` (`:4197`).

- **D6 - The composer dock has no primary-action emphasis.** `.selectionChatInputRow`
  (`:4610-4618`) is a `--surface-subtle` band; the send control is a default MUI
  `IconButton` (`:602-610`) with no accent fill, so the primary action does not
  read as primary. (The dead `.selectionChatSend` class at `:4646` once supplied
  an accent-filled button; it is no longer wired.)

None of D1-D6 is a behaviour defect. All are appearance.

---

## 2. Target visual language (tokens and classes to reuse, each cited)

The recent framed-card overhauls set the direction the chat window should match:
GRADING-CHAT-VISUAL (frame-as-card + sticky composer dock,
`docs/grading-chat-visual-scope.md`) and REPO-HEADER-VISUAL. Reuse, do not invent:

- **Card frame:** `--card-background`, `--card-border` (`globals.css:20-21`,
  dark `:289-290`); `--radius-lg` (`:112`); `--shadow-lg` (`:162`, dark `:332`) -
  the floating-surface shadow the window already uses.
- **Hairlines:** `--border-soft` (`:63`, dark `:296`) - replaces the four ad-hoc
  color-mix borders (D3).
- **Status surfaces:** `--surface-subtle` (`:64`) for the collapsed meta zone and
  the composer dock; `--surface-muted` (`:65`) stays the assistant-bubble fill.
- **Accent:** `--accent` / `--accent-hover` / `--text-on-accent` (already used by
  the user bubble `:4211-4212` and the dead send class `:4652`); `--accent-surface`
  (`:185`) and `--accent-ink` (`:165`, dark `:302`) for subtle selected/active
  states, already used by `.institutionTypeaheadOption[aria-selected]` (`:4549`).
- **Spacing/radii scale:** `--space-1..12` (`:88-96`), `--radius-sm/md/lg`
  (`:110-112`), `--control-height-sm/md/lg` (`:99-101`), `--font-size-*`. Every
  size in the overhaul is named as one of these or as an explicit px - never
  "looks right".

All of these flip between light and dark via the `html[data-theme="dark"]` block
(`globals.css:283+`; there is NO `prefers-color-scheme` route, per the visual
seat card). Because the overhaul is token-only, both themes adapt automatically -
provided no literal hex is introduced and `--danger` white-on-danger small text
is not added (the documented contrast trap).

---

## 3. Overhaul design, per region (token-only; no emojis; reading claims)

Principle for the whole design: PREFER editing the property values of EXISTING
classes (adds zero CSS classes, zero TSX lines, leaves the orphan count at 118
untouched) over adding new classes. Add a new class ONLY where a genuinely new
element is required, and wire it in the same commit (section 4.2).

- **R1 Frame (`.selectionChatWindow`, D1) - SHARED, kept shared (B1):** swap
  `--field-background` -> `--card-background`; swap the ad-hoc border -> `1px solid
  var(--card-border)`. Keep `position: fixed`, `resize: both` (`:4077`),
  `--radius-lg`, `--shadow-lg`, the 360x420 default and the min sizes. Property
  edits only. This is the shared frame class, so the Live Class window and Weekly
  Checklist modal become cards too - a strict, consistent improvement; both are
  listed on the owner walk (AC8).

- **R2 Meta zone (strips + controls, D2 - the biggest win):** collapse items 4-8
  into one visually-grouped zone. NOTE (B2): because CHATBOT-FORMALITY-SCALE lands
  FIRST (section 6), by the time this overhaul builds there will be a
  `FormalityStrip` control sitting beside the voice `ResponseModeStrip` in this
  same control/meta zone. The collapse must group the COMPLETE control set -
  `ResponseModeStrip` + `FormalityStrip` + the status strips - not just today's
  four. The `FormalityStrip` will carry its own class(es) added by that item; this
  overhaul styles them as part of the zone (and must re-measure the zone's markup
  and class set against the as-built formality diff, not against this round-1/2
  snapshot). Two token-only ways to collapse, in preference order:
  (a) PROPERTY-ONLY: reduce each `.selectionChatContext` band to a compact row -
  drop the per-band `border-bottom` to a single divider on the LAST strip before
  the stream, tighten padding to `--space-1 --space-3`, and let `.toneStatusChip`
  carry the pill look it already defines (`:4167-4189`). Zero new classes.
  (b) If the checker/owner wants a true single container, introduce ONE new
  wrapper class (e.g. `.chatMetaZone`) around the strip group and wire it in the
  same commit. This grows the TSX by the wrapper (~2 lines) and adds 1 class that
  MUST be referenced. Recommended: start with (a); escalate to (b) only if (a)
  does not read as grouped. Do NOT touch the live-region markup (`:631-640`) or
  the `role="status"`/no-`role` decisions on the strips (those are a11y, pinned
  by comments at `:678-684`, `:705-709`).

- **R3 Header (`.selectionChatHeader`, D3) - SHARED, kept shared:** border-bottom
  -> `--border-soft`; keep `--surface-subtle` or lift to `--card-background` for a
  flatter card top (decide against the real anchor, not asserted). This is a
  token-only property edit on the shared `.selectionChatHeader`, so the Live Class
  window and Weekly Checklist modal get the same improved hairline (acceptable;
  listed on the owner walk). Keep the header as the drag handle
  (`onMouseDown={onHeaderMouseDown}`, `:657`) and its `cursor: grab/grabbing`
  (`:4115-4122`).

- **R3-close (D4) - SCOPED TO AiChatWindow ONLY (B1):** replace AiChatWindow's raw
  `x` glyph (`:662-668`) with a 16px SVG `<CloseIcon />` matching the existing
  icon set, and give that button icon-button geometry through a NEW, NON-SHARED
  modifier class applied alongside the base, e.g.
  `className={`${styles.selectionChatClose} ${styles.selectionChatCloseIcon}`}`.
  Leave the shared `.selectionChatClose` base rule UNCHANGED so
  `LiveClassWindow.tsx:61-63` (raw `x`) and `WeeklyChecklistOverviewModal.tsx`'s
  TWO buttons (the `:322-325` Refresh with `<RefreshIcon/>` and the `:330-332`
  raw-`x` close) keep their current treatment - applying icon geometry to the
  shared base would misrender all three (section 1.1). The new
  `.selectionChatCloseIcon` is defined in `page.module.css` AND referenced by
  AiChatWindow in the same commit, so it is orphan-NEUTRAL (+1 defined, +1
  referenced; count stays 118). Adds one icon component + the modifier reference
  (counts toward the ceiling - see 4.3).

- **R4 Message stream (D5):** raise group gap `--space-2` -> `--space-3`
  (`:4197`); reveal the per-message action row on `:hover`/`:focus-within` of
  `.selectionChatMsgGroup` instead of always-on, to cut density. This is a
  CSS-only change on existing classes (add a `:focus-within`/`:hover` rule and a
  default `opacity`/visibility on `.selectionChatMsgActionsAi/User`); the markup
  and the MUI `IconButton`s stay. ACCESSIBILITY (reading claim): the actions must
  remain reachable by keyboard, so the reveal is `:focus-within`, not `:hover`
  alone, and the buttons must never be `display:none` (which would drop them from
  the tab order) - use opacity/visibility that still allows focus, or keep them
  always-rendered and only de-emphasise visually. Keep user=`--accent`,
  ai=`--surface-muted` bubbles and their tail radii (`:4209-4239`); these already
  match the house language. Bubble `max-width: 88%/92%` is a percentage of the
  MESSAGE COLUMN (the flex `.selectionChatMessages`), not the resizable window
  chrome, so it is safe to keep (contrast with the typeahead popup, which
  correctly pins a fixed px because it would otherwise resolve against the ~55px
  anchor - `:4510-4513`).

- **R5 Composer dock (`.selectionChatInputRow`, D6):** border-top ->
  `--border-soft`; give the send `IconButton` accent emphasis. Because the send
  control is MUI (`:602-610`), the accent fill is applied via the button's `sx`
  in AiChatWindow.tsx (token values through `var(--accent)` /
  `var(--text-on-accent)`), NOT by wiring the dead `.selectionChatSend` class
  (wiring it would DROP the orphan count below 118 and break the ratchet - see
  4.2). Keep the composer as the bottom dock, `flex-shrink: 0`, and do not alter
  the `slotProps.input`/`htmlInput` structure (pinned - section 5). Leave the
  three dead orphan classes exactly as they are.

- **R6 Suggestion bubbles / attachment chips:** align their hairlines/padding to
  the same tokens (`--border-soft`, `--space-*`); property edits only. Pending
  attachment chips and the drop overlay keep their current structure.

Explicitly preserved (behaviour/structure that must not change): the chat flow,
append-vs-reset, Enter-to-send and the popup-intercept ordering
(`handleKeyDown` `:250-288`), the voice `ResponseModeStrip` (`:725`), the two
knowledge-context strips, the tone-status chips, the `@institution` typeahead and
its `slotProps` wiring, the always-mounted live regions, drag-and-drop, and the
sticky composer dock.

---

## 4. Files, the CSS guards, and the file-size ceiling

### 4.1 The fork, flagged for the owner walk (NOT defaulted by this seat)

The shared `selectionChat*` frame/header/context classes have THREE floating-
surface consumers, not two (measured, section 1.1). So the "fork or not" choice
only ever concerned the token-only shared edits (D1 frame, D3 hairline); the
close-icon change (D4) is FAB-scoped by CONSTRUCTION (R3-close: a new non-shared
modifier class), so it is not part of the fork at all. The two readings:

- **Reading A (RECOMMENDED): restyle the shared `selectionChat*` classes in
  place.** The FAB chat, the text-selection chat, the Live Class window and the
  Weekly Checklist Overview modal all get the improved card frame + hairline.
  Zero new classes for the pure-property edits (D1/D3), no component fork,
  consistent family across every floating surface. Cost: three surfaces beyond
  the FAB change appearance (arguably desirable; the owner asked only about the
  FAB chat, so the owner walk - AC8 - must glance at all four to confirm none
  regressed).
- **Reading B: fork FAB-only frame classes** (new `.chatWindowCard` etc. applied
  only on the `AiChatWindow` frame). Leaves Live Class + Weekly Checklist +
  selection chat on the old `--field-background` frame. Cost: every forked class
  is a NEW class that must be referenced (orphan ratchet) AND grows
  AiChatWindow.tsx toward the 1000 ceiling with conditional-className logic, for
  no benefit beyond "the other three surfaces keep the old look".

This seat recommends Reading A and builds the design in section 3 on it. The
choice is the owner's at the walk; it is a product/scope call, not an agent
default. (Per `iteration-caps.md` this is a legal **(b) Reduce** fork, not a
revision round.)

### 4.2 The orphan ratchet - the hard constraint on CSS classes

`page-module-css-orphan-classes.test.ts` pins `totalOrphanCount` with
`toBe(118)` (`:436`), and a second test pins `PINNED_ORPHAN_CEILING` itself to
`120 - 2 = 118` (`:455-456`). Consequences the build MUST respect:

- **Every NEW class added to `page.module.css` must be referenced** by a
  `styles.<name>` in a file importing it, in the SAME commit - otherwise the
  orphan count RISES above 118 and the ratchet fails.
- **Do NOT wire up any of the three existing orphans** (`.selectionChatInput`,
  `.selectionChatMsgAction`, `.selectionChatSend`). Referencing one would DROP
  the count below 118 and ALSO fail the `toBe(118)` and `toBe(120 - recovered)`
  assertions. The accent send emphasis (R5) therefore goes through MUI `sx`, not
  these classes.
- **Do NOT delete any orphan** for the same reason (a fall breaks the pin).
- If a new class is genuinely added AND a design decision happens to wire up a
  pre-existing orphan (net count change), the build must re-pin
  `PINNED_ORPHAN_CEILING` AND the `120 - totalRecoveredCount` arithmetic
  (`:456`) AND `EXPECTED_RECOVERED` (`:326`) in the same commit, with the new
  count measured by running the test. This is bookkeeping-heavy; the design in
  section 3 is deliberately shaped to avoid it (property edits + MUI `sx` keep
  the count at exactly 118).

`page-module-css-classes.test.ts` is the other direction: every `styles.<name>`
the TSX references must resolve to a defined `.name` (`:404-430`). So the new
close modifier class (R3-close, `.selectionChatCloseIcon`) and any new wrapper
(R2b) must have their classes defined before/with the reference.

**M3 - do NOT touch the dead `.chatModal*` decoy family.** `css-orphans.md:63-73`
lists a fully dead family - `.chatModal`, `.chatModalAiMsg`, `.chatModalClose`,
`.chatModalEmpty`, `.chatModalHeader`, `.chatModalHeaderLeft`, `.chatModalInput`,
`.chatModalInputRow`, `.chatModalMessages`, `.chatModalSend`, `.chatModalTyping`,
`.chatModalUserMsg` (plus `.ccBtn*`/`.ccIconBtn`/`.chipRow` nearby). These are
NOT the chat window - the real chat classes are `selectionChat*`. The names are a
trap: an implementer searching for "chatModal" to style "the chat modal" would
edit dead markup that renders nothing and is wired to no component. They are
counted in the 118 orphans; leave them untouched (editing their properties is
harmless but pointless; wiring or deleting them moves the ratchet).

### 4.3 The file-size ceiling

`AiChatWindow.tsx` is 978 of 1000 (22 lines headroom; `.css` is exempt, 0.x).
Pure CSS edits add nothing to the TSX. The markup changes in section 3 add:
the close-icon swap (R3, ~+6 lines net: a `<CloseIcon/>` component + its JSX),
optionally a meta wrapper (R2b, ~+2 lines), and the send `sx` (R5, ~+4 lines).
That is plausibly ~+12, landing near 990 - under 1000 but tight.

**Contingency (plan an extraction if the markup grows past ~990):** extract the
five icon components (`CopyIcon`/`CheckIcon`/`ResendIcon`/`AttachIcon`/`SendIcon`
+ the new `CloseIcon`) from `AiChatWindow.tsx:927-978` (~52 lines) into a new
leaf `src/app/components/chat/AiChatWindowIcons.tsx` and import them. This drops
AiChatWindow by ~50 lines (to ~930) and the new icons file carries its own
caller (AiChatWindow imports it) in the same wave - it is a component module
(emits runtime code), NOT type-only, so the wave gate sees its caller and does
not read it as dead code. Measure with `@(Get-Content ...).Count` before the
push; never raise a `maxLines` to fit growth.

`AiChatFab.tsx` (943) is barely touched (it only passes props); do not add a new
`className={styles.X} ... role="status"` element to it - `accommodations.structure.test.ts:147-148`
pins AiChatFab's `role="status"` badge classes to EXACTLY `{fabLiveBadge,
fabUnreadBadge}` and a third would redden it. The tone/`role="status"` chips live
in AiChatWindow, outside that file's scan.

### 4.4 Exact write set

- `src/app/page.module.css` - the chat CSS block `:4062-4705` (and only that
  block): property edits to existing shared classes (D1/D3/R4/R5/R6) plus the new
  `.selectionChatCloseIcon` modifier (R3-close) and, if R2b is taken, one meta
  wrapper class. The shared `.selectionChatClose` BASE rule stays unchanged.
- `src/app/components/AiChatWindow.tsx` - the close-icon swap + its non-shared
  modifier class (R3-close), optional meta wrapper, send `sx`, action-row reveal
  class hooks; NO change to the composer `slotProps` structure, the popup-intercept
  order, or the live regions.
- `src/app/components/chat/AiChatWindowIcons.tsx` - NEW, only if the extraction
  contingency fires (4.3).
- `src/app/components/AiChatFab.tsx` - only if a prop must change for the design
  (not expected); keep out of the `role="status"` badge markup.
- NOT in this write set but edited by LiveClassWindow/WeeklyChecklist indirectly:
  those two components are NOT written - they consume the shared classes and
  inherit the frame/hairline change at render. No code change lands in them.

---

## 5. Source-text pins on the chat files (the `owns` list) and why none is a look pin

Derivation command and its output (Bash):

```
grep -rlE 'readFileSync[^)]*AiChat(Window|Fab)|AiChat(Window|Fab)\.tsx' src --include=*.test.ts
-> src/app/components/accommodations/accommodations.structure.test.ts
   src/app/components/chat/institutionResolutionWiring.test.ts
   src/app/components/chat/institutionTriggerWiring.test.ts
   src/app/components/chat/responseMode.wiring.test.ts
   src/app/components/content-tab/modules/askAiSelection.wiring.test.ts
   src/app/components/FabQuickActionsMenu.wiring.test.ts
   src/app/components/wb-remembered-fab-launch.wiring.test.ts
```

Plus the two stylesheet guards that read `page.module.css` and every importer:
`page-module-css-classes.test.ts`, `page-module-css-orphan-classes.test.ts`.

Each pin, opened, and what it asserts (all behaviour/wiring, none a look pin -
the overhaul must keep every one green):

- `institutionTriggerWiring.test.ts` - reads `AiChatWindow.tsx`. Asserts the
  typeahead imports (`:37-38`), the `AiChatWindowProps` fields (`:52-66`), the
  `import styles from "../../page.module.css"` spelling (`:74`), and - the ones
  with teeth for a visual edit - `slotProps.input` carries
  `onKeyDown/onKeyUp/onPaste` (`:79-87`), `slotProps.htmlInput` NEVER carries
  `onKeyDown/onKeyUp` and DOES carry `role: "combobox"` + `aria-expanded`
  (`:90-104`), and the popup-intercept block precedes `handleSend()` inside
  `handleKeyDown` (`:109-114`). KEEP the composer `slotProps` structure and the
  keydown ordering exactly; R3/R5 do not touch them.
- `institutionResolutionWiring.test.ts` - reads `AiChatFab.tsx`; resolution path,
  shared-cap import, strip-through-`knowledgeContextStripText`, four typeahead
  fields passed to AiChatWindow. Untouched by a CSS/markup restyle.
- `responseMode.wiring.test.ts` - reads `AiChatFab.tsx` + `route.ts`; the
  `ask-ai-voice-mode` `ta:` key and the `responseMode` prop/field. Untouched.
- `accommodations.structure.test.ts` - reads `AiChatFab.tsx`; `role="status"`
  badge classes EXACTLY `{fabLiveBadge, fabUnreadBadge}` (`:147-148`). Respected
  by 4.3 (stay out of that markup).
- `askAiSelection.wiring.test.ts`, `FabQuickActionsMenu.wiring.test.ts`,
  `wb-remembered-fab-launch.wiring.test.ts` - read the Modules view /
  FabQuickActionsMenu / AiChatFab handlers; none asserts chat-window look.

Conclusion: there is no existing structure/VH-style pin on the chat window's
VISUAL markup. The pins protect wiring and a11y; the design in section 3 is built
to leave all of them green.

---

## 6. Disjointness

The write set (4.4) is `AiChatWindow.tsx`, `AiChatFab.tsx` (minimal), the chat
block of `page.module.css`, and optionally a new `chat/AiChatWindowIcons.tsx`.

- vs **CHATBOT-FORMALITY-SCALE** (backlog `actionable`, confirmed present:
  `grep -ac "CHATBOT-FORMALITY-SCALE" docs/BACKLOG.md` -> 1) - **WRITE-OVERLAPPING,
  NOT merely stylesheet-sharing (B2, round 2).** That item adds a `FormalityStrip`
  control beside the voice `ResponseModeStrip` in the chat's meta/control zone, so
  it writes the SAME source files this item does - `AiChatWindow.tsx` and/or
  `AiChatFab.tsx` - AND moves the SAME global orphan ratchet (it adds a strip +
  its classes). This is NOT disjoint on any axis: same files, same ratchet. The
  two MUST be SERIALIZED, and the ORDER is fixed: **CHATBOT-FORMALITY-SCALE lands
  FIRST, then this visual overhaul styles the COMPLETE control set** (voice +
  formality + status strips). Consequences this scope already absorbs: R2's
  meta-zone collapse must include the as-built `FormalityStrip` (section 3, R2);
  the implementer re-measures the control-zone markup, the class set, the orphan
  count and the AiChatWindow/AiChatFab line counts against the post-formality tree
  at build time, NOT against this round-2 snapshot (the counts here - 978/943/118 -
  will have moved once formality lands). If this item is somehow dispatched before
  formality, STOP and re-sequence; building the restyle first would force a second
  restyle pass the moment the formality strip arrives.
- vs **KNOWLEDGE-ASK-AI-INDEPENDENT** (touches `KnowledgeOverviewPanel` /
  `KnowledgeTab` - the knowledge-tab Ask AI panel): no shared source file.
  `git` path intersection is empty. CAVEAT (not a conflict): both import
  `src/app/page.module.css`. If that item also edits page.module.css, the two
  must NOT run simultaneously - `page.module.css` is one file and a concurrent
  edit races (per `parallel-disjointness.md`, a shared file is the trap, and the
  orphan ratchet is a global count both would move). Recommend SEQUENCING against
  any other open item that writes `page.module.css`; they are informationally
  independent but not write-disjoint on the stylesheet.
- vs **KNOWLEDGE-MUTATION-LAG** (`useKbPageTree` / `useKbTreeActions`): no shared
  file, no shared stylesheet edit expected. Disjoint.
- The shared-component fact (1.1) means the SelectionChatWidget surface is
  affected by Reading A - that is in-scope, not a cross-item overlap.

Mechanical intersection to run at build time (paste the output; empty is the
only pass): `git diff --name-only` of this wave `sort | uniq -d` against any
concurrently dispatched item's file list, with special attention to
`src/app/page.module.css`.

---

## 7. Acceptance criteria

Machine-checkable (CSS-class/structure pins + ceiling):

- **AC1** The baseline gate (0.1) returns to green after the wave: all 7 paths
  `COVERED`, `Tests ... passed`, exit 0. Object: the seven test files. Instrument:
  `npm run test:paths <p1> ... <p7>`. Failure direction: any `NOT COVERED`, any
  failing test, or a non-green total.
- **AC2** Orphan ratchet unchanged: `totalOrphanCount === 118`
  (`page-module-css-orphan-classes.test.ts` passed=9, the `toBe(118)` assertion).
  Object: the orphan count across all stylesheets. Instrument: that test.
  Failure direction: count rises (unreferenced new class) OR falls (an orphan
  wired or deleted) without the pin + arithmetic + `EXPECTED_RECOVERED` re-pinned
  in the same commit.
- **AC3** Every `styles.<name>` referenced by AiChatWindow/AiChatFab resolves
  (`page-module-css-classes.test.ts` passed=10). Object: references vs definitions.
  Instrument: that test. Failure direction: a reference to an undefined class
  (e.g. a new close-icon class referenced but not defined).
- **AC4** `institutionTriggerWiring.test.ts` stays green (passed=19): the composer
  `slotProps` structure, combobox ARIA, props and keydown ordering preserved.
  Failure direction: any change to `slotProps.input`/`htmlInput` shape or the
  popup-intercept-before-send order.
- **AC5** File-size ceiling green (`file-size-ceiling.structure.test.ts`): every
  `.tsx` touched stays <= 1000, measured by `@(Get-Content <file>).Count`. Object:
  AiChatWindow.tsx (and AiChatWindowIcons.tsx if created). Failure direction:
  AiChatWindow.tsx exceeds 1000 (then the icon extraction in 4.3 is mandatory).
- **AC6** No emojis / source stays text: `no-emojis.test.ts` + `source-bytes.structure.test.ts`
  green.
- **AC7** `accommodations.structure.test.ts`, `institutionResolutionWiring.test.ts`,
  `responseMode.wiring.test.ts` stay green (no new AiChatFab `role="status"` badge
  class; resolution/voice wiring untouched).

Owner/browser walk (the LOOK - not machine-verifiable here; see residual RES-1):

- **AC8** The FAB chat window reads as a cohesive card (card frame, grouped meta
  zone holding the complete control set - voice + formality strips - and a clear
  header / scroll / composer-dock structure), in BOTH light and dark theme, with
  no emoji, matching the grading/repo-header card language, and the AiChatWindow
  close control shows a proper close icon. Verified by the owner on prod
  (auto-deploys from main) or a local preview spike. Pin the artefact the owner
  sees, never a `data-` proxy.
- **AC9 (widened, B1)** Under Reading A the shared frame/hairline change reaches
  THREE collateral surfaces; the owner walk must confirm none regressed: (i) the
  text-selection chat (same `AiChatWindow`), (ii) the Live Class window
  (`LiveClassWindow`, raw-`x` close unchanged), and (iii) the Weekly Checklist
  Overview modal (`WeeklyChecklistOverviewModal`, its Refresh + raw-`x` close
  buttons unchanged). Same walk, both themes.

---

## 8. Wave plan

**ONE wave.** A W1-frame / W2-polish split is NOT advisable here: both halves
would write the SAME two files (`AiChatWindow.tsx` + the one CSS block), so they
are not write-disjoint and would serialize with doubled gate runs for no
isolation benefit. The whole overhaul is a single cohesive edit to one component
and one stylesheet block.

This wave is built ONLY AFTER CHATBOT-FORMALITY-SCALE lands (section 6, B2); it
is not dispatchable concurrently with it (same files, same ratchet). Re-measure
every section-0 quantity against the post-formality tree before building.

Wave W1 (the only wave) - write set in 4.4. Implementer brief must carry:
1. The design in section 3, the Reading-A decision (4.1) or the owner's answer if
   it arrived, and the "property edits over new classes" principle.
2. The orphan-ratchet rules (4.2) verbatim - especially "do not wire/delete the
   three orphans", "every new class referenced in the same commit", and M3 "do
   NOT touch the dead `.chatModal*` decoy family".
3. The ceiling contingency (4.3) with the measurement command.
4. The slotProps / keydown-order preservation (section 5, AC4).
5. B1 - the close-icon change (R3-close) is AiChatWindow-ONLY via a new
   non-shared `.selectionChatCloseIcon` modifier; the shared `.selectionChatClose`
   base is UNTOUCHED so `LiveClassWindow` (raw `x`) and `WeeklyChecklistOverviewModal`
   (Refresh + raw-`x` buttons) do not regress. D1/D3 frame + hairline stay on the
   shared classes and reach all three surfaces by design.
6. B2 - the meta-zone collapse (R2) must group the as-built `FormalityStrip`
   beside `ResponseModeStrip`, not just today's strips.

Wave gate (PowerShell, one path per argument, `npm run test:paths`, the three
CSS/ceiling guards UNCONDITIONAL):

```
npm run test:paths src/app/components/courses/page-module-css-classes.test.ts src/app/components/courses/page-module-css-orphan-classes.test.ts src/file-size-ceiling.structure.test.ts src/source-bytes.structure.test.ts src/lib/no-emojis.test.ts src/app/components/chat/institutionTriggerWiring.test.ts src/app/components/chat/institutionResolutionWiring.test.ts src/app/components/chat/responseMode.wiring.test.ts src/app/components/accommodations/accommodations.structure.test.ts
```

Then `npx tsc --noEmit` (single caller, the wave gate), `npm run lint` (exit 0,
no NEW warning in the written files - never a literal count), and the build
compile-line check (grep `Compiled successfully`, do not `&&` on exit code).
Gate the tree with `git status --short` against the write set, and confirm no
`.claude/worktrees` copy was edited (Glob returns it first).

---

## 9. Residual register

Each entry names an owner, an instrument, and the measuring step. A residual not
in `docs/BACKLOG.md` does not exist.

- **RES-1 (the LOOK, widened B1).** Owner: repo owner. Instrument: human eyes on
  the running app, both themes. Step: owner/browser walk of the FAB chat (AC8)
  and, under Reading A, the THREE collateral surfaces (AC9: selection chat, Live
  Class window, Weekly Checklist Overview modal), on prod after the push or a
  local preview spike. Reason it is a residual: no component renders under vitest
  (`this-repo.md` section 6), so "looks good" has no machine instrument here.
  This is a DEFERRAL with all three parts, not a deletion.
- **RES-2 (Reading A vs B fork, narrowed B1).** Owner: repo owner. Instrument:
  the owner's product decision at the walk. Step: confirm at AC8/AC9 whether the
  shared frame/hairline change reaching the selection chat, Live Class window and
  Weekly Checklist modal is acceptable (A) or a FAB-only frame fork is wanted (B).
  The close-icon (D4) is already FAB-scoped by construction and is NOT part of
  this fork. Recommended reading A is built now; a B answer is a new activity, not
  a revision round.
- **RES-3 (meta-zone depth, R2a vs R2b).** Owner: implementer + verify pass.
  Instrument: AC2 (orphan ratchet) + the owner walk. Step: start with the
  property-only collapse (R2a, zero new classes); escalate to the single-wrapper
  class (R2b, +1 referenced class) only if R2a does not read as grouped, re-pin
  nothing since R2b only ADDS a referenced class (count stays 118).
- **RES-4 (ceiling headroom).** Owner: implementer. Instrument: AC5 /
  `@(Get-Content AiChatWindow.tsx).Count`. Step: if the markup pushes
  AiChatWindow.tsx past ~990, perform the icon extraction (4.3) in the same wave
  before the push.

All four must be reconciled into `docs/BACKLOG.md` at disposal/push time with
owner, instrument and step intact.

---

## 10. What this seat could not determine

- Whether the owner accepts the shared frame/hairline change reaching the three
  collateral surfaces (selection chat, Live Class window, Weekly Checklist modal)
  vs a FAB-only frame fork (RES-2) - a product call, escalated, not defaulted.
- How any of this LOOKS - unverifiable in this environment (no render, no
  `.env`, no meaningful app drive); RES-1.
- The EXACT post-formality markup, class set and line counts of the control zone
  (B2): CHATBOT-FORMALITY-SCALE has not landed, so the build-time tree will
  differ from this round-2 snapshot (978/943/118). The implementer re-measures;
  this scope cannot pin numbers for a tree that does not exist yet.
- Nothing in the tree contradicts the backlog row; no measurement/brief conflict
  to report.
