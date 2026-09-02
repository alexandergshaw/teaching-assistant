# Recording sub-tab controls - UX and aesthetics pass - acceptance criteria

Requested 2026-09-02: "do an aesthetics/ux pass over the controls on the
discussion replies sub tab" and, in the same breath, "same with all its
siblings". The siblings are the other eight inner views of the Recording tab
(`src/app/components/RecordingTab.tsx:582`): Record, Record announcement,
Discussion replies, Grading (from a recording), Module walkthrough deck,
Change speed, Caption a video, Narrate a deck, Avatar. A second mid-session
ask, "i need a button for each reply that manually regenerates it", is a
row-level control on the first of those and is section 10.

This is a **controls** pass: buttons, selects, inputs, toggles, sliders, action
clusters, toolbars, arm/confirm pairs, busy states, and the sub-tab strip that
reaches them. It is NOT a second token pass (REGRESSION 381 did that) and NOT
a second discussion-table redesign (REGRESSION 382/383). What it IS: the same
nine screens with their controls grouped, weighted, sized, named and
sequenced the way a professional product does it, and with the controls' own
click cost and keyboard path fixed where the surveys found them broken.

Standing contract, not restated here: `docs/aesthetics-pass-acceptance-
criteria.md` sections 1, 2 and 4b (AM1-AM26). Every criterion below is
additive to that document.

**Revision 4, 2026-09-02.** Revisions 2 and 3 folded in two adversarial
checks (32 findings). Revision 4 reconciles the four concurrent pre-code
passes - architect, UX, data engineer, aesthetics - which read revision 3 with
nothing but the tree. Where two passes disagreed, the disagreement and the
call are recorded inline. The largest changes: the segmented toggle is a
track with a raised segment (the app's own sub-tab idiom), not a row of
filled buttons; "Copy all replies" is never a primary; the group's rendered
heights are derived from MUI source (a small TextField is 37.7px here, not
40); the regenerate button's type thread lands in wave 0; and the MUI warning
palette is fixed in the theme because every warning-toned control was
shipping at 3.1:1.

---

## 0. What the surveys found (2026-09-02, five read-only inventories)

Measured over section 4's 36 files (data pass, brace-aware scanner): 178
`Button`, 8 `IconButton`, 73 `TextField`, 14 `Checkbox`, 2 `Slider`, 85
`MenuItem`; 161 `size="small"` buttons and **25 with no size** (MUI medium):
StagePanel 657-683 (7), WalkthroughPanel 195-224 (7), SpeedPanel 274-286 (3),
AvatarStudioPanel (8). **339 inline `style={{}}` objects, 208 of them
layout-only** (display/gap/flexWrap/alignItems/justifyContent/margin*/width/
minWidth) across 33 files - that is CC3's workload. 62 `sx={{}}`, almost all
`minWidth`/`width`. Eleven `? "contained" : "outlined"` ternaries in six
files. Thirty-seven static `variant="contained"` primaries (41 with the four
`color="error"` ones), per-file counts in the data pass report and frozen
by the orchestrator after wave 1 (section 6).

The shapes that repeat, which is what makes them a contract problem rather
than nine local ones:

| Shape | Where it shows up |
| --- | --- |
| **Layout by inline style object** instead of the two classes that already do it (`.adaptRow` page.module.css:890, `.ghActions` :1574) | 208 sites; the densest: SourceDevicesPanel (23), TakeAnnouncementPanel (15), DiscussionReplyRow (14), SpeedPanel (12), VideoSource (11), PreviewExport (11) |
| **The run-log row is byte-identical in five files** (`div.fieldHint` + inline flex + two text Buttons with `style={{minWidth:0}}`) | DiscussionRepliesPanel 578-586, GradingRecordingPanel 547-554, LegibilityProbeModal 247-255, ModuleDeckCapturePanel 656-664, TakeAnnouncementPanel 190-197 (a sixth copy of the LABEL at `drafted-grades/RepoGradingLogPanel.tsx:72` is outside every group) |
| **Segmented toggles spelled four ways**, and every one renders the selected option as the screen's primary fill | DiscussionRepliesPanel 624-639, DiscussionReplyToolbar 120-132, SpeedPanel 222-234, SlideStudio 28-43, StagePanel 464-478 and 598, LectureScriptPanel 96 |
| **Arm/confirm spelled five ways** - and NO armed confirm is `contained` today: every armed button is a bare (text) Button (DiscussionReplyToolbar 194, DiscussionRepliesPanel 649, GradingTable 136), so the confirm step is QUIETER than the idle step; the row-level ones are a MenuItem label swap with no Cancel and an `onBlur` disarm | DiscussionReplyToolbar 192-205, DiscussionRepliesPanel 647-661, GradingTable 134-155, DiscussionReplyRow 425-434/703, GradingTableRow 148-161, TakeAnnouncementPanel 532-548 |
| **Busy is a label swap plus `disabled`, or a deleted button** - no spinner anywhere in the nine surfaces | GradingRecordingPanel 628, ModuleDeckCapturePanel 823, LegibilityProbeModal 260, RubricInputModal 281, TakeAnnouncementPanel 538/548, SpeedPanel 119/130/278, CaptionStudio 218, DeckModeSection 79/141, AvatarStudioPanel 318/382/436/573; buttons REMOVED while busy at TakesPanel 152-154 and StagePanel 428-430 |
| **Two or more filled-accent buttons on one screen** | StagePanel (Record + Done + active tool + Generate script + Resume), ModuleDeckCapturePanel 744 + 823, GradingRecordingPanel 625 (Start capture filled, Grade submissions outlined), PreviewExport 104 + 112 + 183 + CaptionsList 238 + CaptionStudio 218, DeckModeSection 79 + 141 + SlideStudio 29/37 + StockVoiceSection 52 + VoiceRecordingSection 94/139, SpeedPanel 224 (selected chip) + 286, AvatarStudioPanel 319/327/334/383/437/548/574 (four at once with a likeness present), WalkthroughPanel 195/211/220, VideoModeSection 91/203, AddKnowledgePages 395 |
| **Four "small" heights in one family** (derived from MUI 9.0.1 source, never observed): `Button size="small"` 30.75px (13px x 1.75 + 4/3+1/4 padding, Button.js:213-250); `IconButton size="small"` 28px (IconButton.js:129-130); `TextField size="small"` **37.7px** because theme.ts:93 sets the outlined input to 0.9rem (InputBase.js:152 + OutlinedInput.js:154); `Checkbox size="small"` 38px (SwitchBase.js:38). None equals a `--control-height-*` token. | GradingRecordingPanel 557-583, ModuleDeckCapturePanel 670-716, GradingTable 102-155, StagePanel 463, TakesPanel 132 vs 157, AnnouncementCompositionControls 76 |
| **Icon-only or ambiguous names** | DiscussionReplyRow 678 (More: no `title`), 882 (remove resource: no `title`); GradingTable 115 (Clear search: no `title`); CaptionsList 127/162 (two buttons both named "Set"), 111/119/146/154 (`title` but no `aria-label`), 172 ("Jump", neither) |
| **Destructive actions with no confirmation** | TakesPanel 85, AvatarStudioPanel 471 and 351, CaptionsList 220, VoiceRecordingSection 118, VoiceCloneSection 37, TakeAnnouncementPanel 385 and 462 |
| **`.field label` restyles MUI labels** - `.field label` (page.module.css:154-160) is the tracked-uppercase micro-label at (0,1,1), which beats emotion's single class; a `FormControlLabel` AND a TextField's `InputLabel` both render a `<label>` | SourceDevicesPanel 240/296/391/446 and 488/498; ModuleDeckCapturePanel 720; DeckModeSection 67; VoiceCloneSection 33 (reasoned from source; never rendered) |
| **Status text hidden from assistive tech** - the whole capture status row is `aria-hidden` including the timer and "N found"; the three siblings have ZERO live capture regions today | GradingRecordingPanel 634, ModuleDeckCapturePanel 761, LegibilityProbeModal 269 (DiscussionRepliesPanel 728 pairs it with a throttled region at 920) |
| **Keyboard-unreachable** | RubricInputModal 280-282 (`display:none` file input inside a `<label>`), TakeAnnouncementPanel 511-519 (confirm preview scroller with no `tabIndex`), GradingTableRow 149 (`onBlur` disarms the confirm) |
| **Warning tone fails AA everywhere it is used.** `theme.ts` defines no `warning` palette, so MUI's default `#ed6c02` applies: white-on-it and it-on-white are both 3.1:1, and at 13px/600 that is normal text (AC13). "Confirm redraft" (`DiscussionRepliesPanel.tsx:649`) already fails. | fixed in the theme by the orchestrator before wave 0 (section 4) |
| **Sub-tab strip** | wrap already applied by the orchestrator (page.module.css:3714-3717); `id`/`aria-controls`/`role=tabpanel` still missing and are group T's |

Two things the surveys found that are NOT controls problems and are recorded
here so they are not lost, then handled in section 7: `VideoModeSection.tsx:152`
"Remove audio" clones state and never calls a setter; and `RubricInputModal.
tsx:3-17` and `LegibilityProbeModal.tsx:15-17` disagree in their headers
about whether the rubric modal is reachable.

---

## 1. The control contract

**CC1 - One filled button per screen state, and it is the next step.** On any
one rendered state of a sub-tab there is exactly one `variant="contained"`
`color="primary"` button, and it is the action the instructor is most likely
to take next. State decides which, and **a live capture beats everything**:
while capturing, the primary is **Stop capture** (`contained`
`color="primary"`, not `error` - stopping is not destructive). Otherwise:

- **Discussion replies.** The panel computes
  `pendingEligible = rawRows.filter(isDraftAllPendingEligible).length`
  (`discussion-table-view.ts:416` - NOT a raw state count, which would light
  a button `draftAllPending` refuses to dispatch, `useDiscussionReplies.ts:
  710-716`) and
  `primaryAction = capturing ? null : (drafting || pendingEligible > 0) ?
  "draft" : null`, passed to `DiscussionReplyToolbar` as a new prop
  `primaryAction: "draft" | null`. "Draft the missing replies" takes
  `variantFor(primaryAction === "draft")` and `loading={drafting}` - while
  the drain runs the primary is the busy one, with the reason line "Drafting
  N remaining" under the toolbar (the UX pass caught that revision 3 would
  have made a `disabled` button the primary for the whole drain). Start/Stop
  capture in the run row takes `variantFor(capturing || primaryAction ===
  null)`. **"Copy all replies" is never a primary**: Canvas has no bulk reply,
  the instructor's job is thirty per-row copies, and the whole-table copy's
  count lies under a filter (`DiscussionRepliesPanel.tsx:332-338`); it stays
  `outlined`. Revision 3's "rows exist -> Copy all" is withdrawn.
- **Grading.** Rows exist -> **Grade submissions** (re-grading is legal); else
  **Start capture**. Grade submissions with no rubric is `disabled` with the
  visible reason "Add a rubric to grade" instead of today's post-click refusal
  (`GradingRecordingPanel.tsx:542-543`).
- **Module deck.** Extracted material exists -> **Generate deck**; else **Start
  capture**. `disabled={!generateGate.ok}` stays spelled exactly as today
  (`ModuleDeckCapturePanel.wiring.test.ts:277` pins it); `loading` sits
  beside it.
- **Legibility probe modal - the documented exception to "capture beats
  everything".** Its own hint (`LegibilityProbeModal.tsx:264-267`) tells the
  instructor to run the probe WHILE capturing, and `canRun` gates on
  `pendingFrames` (`:201`). Primary = **Run legibility probe** whenever
  `canRun`, else **Start capture**; Stop capture is `outlined` here.
- **Record.** **Start preview** before a stream, **Record** once there is one,
  **Stop** while recording (`contained` primary, no longer `error`), **Resume**
  while paused. While the annotation tools are open (`StagePanel.tsx:462`,
  `tool !== "off"`) **Done** is the primary and the tool buttons are a
  SegmentedToggle (CC4); the second Draw/Highlight/Erase cluster rendered
  while `tool === "off"` (`:533-556`, entry buttons with no selected value)
  stays three `outlined` Buttons. **Mute** (`:598`) is one Button with
  `aria-pressed={muted}`, stable label "Mute", `variantFor(muted)`,
  `color="primary"` - never `error`. **Generate script** inside the script
  disclosure is `outlined`. **WalkthroughPanel**: Start walkthrough / Resume /
  Stop and keep (while running; `color="primary"`, not `error`) take
  `variantFor`; "Loading…"/"Finishing…" (`:220`) becomes the primary with
  `loading`.
- **Announcement.** **Post to Canvas** (already correct). In the real-time
  confirm state (`:290-299`) the Post row is not rendered (`:346`), so **Play
  it back stays `contained`** there - it is the only forward action on that
  screen. Revision 3's demotion is withdrawn.
- **Change speed.** **Save at N x**. The rate chips are a SegmentedToggle.
- **Caption a video.** **Generate captions** until captions exist; then
  **Download .vtt** - the closed-caption file is the accessible deliverable
  a Canvas instructor uploads; a burned-in export cannot be turned off or
  read by a screen reader (UX pass). Export video with captions, Preview and
  Download captioned video are `outlined`. If the owner prefers burn-in as
  the primary, that is a one-line change and the reason goes here.
- **Narrate a deck.** **Draft narration** until a script exists; then
  **Generate audio** / **Generate audio + video**; the mode switch is a
  SegmentedToggle; the voice sections' "Use this voice" / "Create voice
  clone" / "Start recording" are `outlined` (inside disclosures, not the main
  path). **VideoModeSection**: **Generate narration** until segments exist;
  then **Apply narration to video**.
- **Avatar.** Revision 3 said "already correct"; it is not - four stages
  render `contained` at once with a likeness present. Rule: **the first stage
  whose gate is open is `contained`; every later stage is `outlined`**
  (capture -> save -> train -> script -> render, `AvatarStudioPanel.tsx:319/
  327/334/383/437/548/574`).
- **AddKnowledgePages** "Add N pages" (`:395`) is `outlined`: it sits inside
  a disclosure on two surfaces that each already have a primary.

**The one legal spelling of a state-dependent primary** is
`variant={variantFor(isPrimary)}` where `variantFor` is exported from
`src/app/components/ui/buttonVariant.ts` (group P):
`export function variantFor(primary: boolean): "contained" | "outlined"`.
After this group the literal `? "contained" : "outlined"` exists in
`buttonVariant.ts` and nowhere else in section 4's file lists.

**The closed treatment set on these nine surfaces (aesthetics R3):**
primary `variant="contained"`; secondary `variant="outlined"`; ghost
`variant="text"`; danger-secondary `variant="outlined" color="error"` (toolbar
idle: Delete table, Clear table, Delete likeness); danger-ghost `variant=
"text" color="error"` (row/menu idle: Remove row, Discard, Remove cue, Cancel
take); armed `variant="contained"` with `color="error"` or `"warning"`.
**Forbidden:** `color="inherit"`, `color="secondary"`, `color="success"`,
`size="medium"`/`"large"`/no size, any `sx` colour, `disableElevation`
restated per site. The one exception is the navy latest-take bar's two text
buttons at `StagePanel.tsx:436/445` (`sx={{ color: "var(--on-navy)" }}`,
AM1/AM18). **Every Button, IconButton, Checkbox, Radio and Switch on these
surfaces is `size="small"`** - the 25 unsized buttons named in section 0 and
the medium checkboxes at `AvatarStudioPanel.tsx:432` and `WalkthroughPanel.
tsx:179` become small. Inline text actions have two spellings by context and
they never mix (R5): inside a sentence (`.fieldHint`, `.notice`,
`.consequence`) the action is `.linkButton`; as a standalone control in
`.ghActions`/`.runLogRow` it is MUI `variant="text" size="small"`.

**A disabled primary carries a visible reason.** Where a primary is disabled
by a gate with a reason string (`postUnavailableReason`, `generateGate`,
`blockedReason`, no rubric, the stock-voice "not loaded" state at
`StockVoiceSection.tsx:55`, the deck-mode gate at `DeckModeSection.tsx:144`),
that reason renders as a `.fieldHint` line directly under the run row.
Disabled SECONDARY buttons in a toolbar (Copy all at 0 copyable, Find
resources at 0) carry the reason as `title`.

**CC2 - Settings are grouped under named sections, and the run row is the
last thing in the settings block.** Any surface with more than four settings
controls before its primary action groups them into sections. A section is
`<fieldset className={controls.section}>` with `<legend
className={controls.sectionLegend}>` (source text in sentence case; the CSS
uppercases it per AM5). The section names and order:

| Surface | Sections, in order |
| --- | --- |
| Discussion replies | **Capture** (course, save the screen recording, and the course-loading hint) / **Replies** (row 1: `<SegmentedToggle showLabel>` "Replying to" then the `.reservedSlot` holding the Redraft ConfirmArmButtons, with the redraft consequence line rendered directly after THAT row, not after the section; row 2+: `<DiscussionReplyControls>`) / **Context** (the Knowledge-context block - label, carried pages, add pages - rendered through the `children` slot of `DiscussionCaptureSettings`; its markup stays in the panel source because two tests pin it there, CC17) / **Resources** (`<DiscussionResourceSettings>`) |
| Grading | **Capture** (course) / **Grading** (rubric) / **Context** (the Knowledge-context block as today) - then the run row. `GradingRecordingPanel.wiring.test.ts:55` pins the exact gate `{droppedFramesTotal > 0 &&`; CC11's notice rewrite keeps it. |
| Module deck | ONE section, **Deck** (course "where the deck is saved", module name, template, context - nothing here is a capture setting) - then the run row. Only `ModuleDeckCapturePanel.tsx:670-733` minus `:709-714` moves into `ModuleDeckSettings.tsx`; the "always produces N slides" hint (`:711-714`) STAYS in the panel, rendered beside the template picker as its own AM-C note (`:709-710`) records and as `ModuleDeckCapturePanel.wiring.test.ts:196-203` requires (it must precede "Start capture"; revision 3's "under the run row" is withdrawn - the UX and data passes both caught it). The run row (`:743-750`), the `resolvedSlideCount` memo, the `moduleDeckCaptureLogSummaryLine(` call, `<LegibilityProbeModal`, and the Generate cluster with `{!generateGate.ok && ...generateGate.reason}` all stay in the panel (wiring test `:163-193, 232, 281`). The new file contains NO `ta-` text, not even in a comment (`module-deck-capture.structure.test.ts:143-151` counts fragments). |
| Record: SourceDevicesPanel | **Source** (source, camera, microphone, system audio, resolution) / **Webcam bubble** / the "Recording options" disclosure keeps its own grouping, its `<summary>` open state persists (CC10), and the "Backup" `<label>` at `:392` becomes a legend inside it |
| Announcement | **Compose** (course, "should include", formality) / the review block is not settings and keeps its shape |
| Speed, Voice recording | the ordinal subtitles ("2. Playback speed" `SpeedPanel.tsx:219`; "1./2./3." `VoiceRecordingSection.tsx:44/71/129`; captions "1./2./3." at `VideoSource.tsx:52`, `CaptionStudio.tsx:200`, `PreviewExport.tsx:70`) become legends WITHOUT the ordinal - no reference product numbers settings groups. This is a label edit permitted under CC16 by the orchestrator. |

The **run row** is `<div className={`${styles.ghActions} ${controls.runRow}`}>`
holding the primary (CC1), the secondary run-adjacent actions and nothing
else; `.runRow` draws AM11's hairline above it so the block reads settings /
settings / actions. It is the last child of the settings block, immediately
followed by the status area. The rationale at `DiscussionRepliesPanel.tsx:
669-678` (controls discovered below Start are discovered too late) stands
for every capture surface; the probe modal (run row first, no settings) is
the correct exception.

**CC3 - Rows are classes, and a row holds one kind of control.** Every
wrapping row of controls in an owned file is `.adaptRow` (fields;
bottom-aligned) or `.ghActions` (buttons; centre-aligned). No inline `style`
object whose only job is `display/gap/flexWrap/alignItems/justifyContent/
margin*` survives in an owned file (a residual `style={{ minWidth: 0 }}` on a
flex child is not layout and may stay). A row holds fields OR buttons, never
both. The three places a button must sit beside a field take `className=
{controls.fieldRowButton}` = **`align-self: stretch`** (aesthetics R2: inside
`.adaptRow`'s `align-items: flex-end` line it stretches to the field's 37.7px
without a literal, and tracks any future font change; revision 3's `height:
40px` would have stood 2.3px proud of the field): SourceDevicesPanel 368
(Choose image beside Background), RecordingTab 759/769 (the library picker's
two actions), CaptionsList 70 (Shift all beside its number field). A field
with `helperText` never shares a row with a `.fieldRowButton`. **No MUI
control is ever placed inside a `.field` container**; the named sites move
their control out to an `.adaptRow` and keep any `.fieldHint` beneath it.

Field widths are a closed set expressed as classes in the shared stylesheet
(CC13), never as per-file `sx` numbers: `.fieldXs` (80px), `.fieldSm`
(120px), `.fieldMd` (220px), `.fieldLg` (320px), `.fieldGrow` (`flex: 1 1
300px`). `sx={{ minWidth: N }}` and `style={{ width: N }}` on a TextField
disappear from every owned file (the wave gate greps `minWidth:` in the nine
file lists - AM25). A `className` on a MUI `TextField` lands on its
`FormControl` root, which is the element that carries width today.

**CC4 - One segmented-toggle component, and it is a track, not a row of
primaries.** The aesthetics pass rejected revision 3's contained/outlined
pairs: a selected option rendered as the screen's primary fill breaches CC1
and AM11's selected rule, and every reference product renders a segmented
control as one track with a raised segment - which this app already does
twenty pixels above these panels, in the sub-tab strip (`.lessonInnerTabs/
.lessonInnerTab/.lessonInnerTabActive`, page.module.css:3712-3742).
`src/app/components/ui/SegmentedToggle.tsx`, new:

```ts
export interface SegmentedToggleOption<V extends string | number> {
  value: V;
  label: string;
  /** Rendered as " (N)" after the label; the status-chips idiom. 0 renders. */
  count?: number;
  disabled?: boolean;
}
export default function SegmentedToggle<V extends string | number>(props: {
  /** Accessible name of the group. Rendered VISIBLY as a `.ghMeta` span
   *  ("Replying to:") when `showLabel` is true, and the group then uses
   *  aria-labelledby pointing at it; otherwise aria-label. */
  label: string;
  showLabel?: boolean;
  options: readonly SegmentedToggleOption<V>[];
  value: V;
  onChange: (next: V) => void;
  /** Disables every option (busy). Per-option `disabled` still applies. */
  disabled?: boolean;
}): JSX.Element;
export function optionLabel(option: SegmentedToggleOption<string | number>): string;
```

Renders `<div role="group" ... className={controls.segmented}>` and one
**native** `<button type="button" className={controls.segment (+
.segmentSelected)} aria-pressed={selected}>` per option - not MUI Buttons,
so it never calls `variantFor` and the one-primary count never includes a
toggle. **Roving tabindex**: the group is ONE tab stop (`tabIndex` 0 on the
selected segment, -1 on the rest; ArrowLeft/ArrowRight/Home/End move and
select), the same keyboard model `RecordingTab.tsx:585-598` already gives
the strip. `V extends string | number` because `SPEED_RATES` is numeric
(`src/lib/video-speed.ts:17-18`; `setRate(rate: SpeedRate)` at
`useVideoSpeed.ts:140`); where a consumer's state is wider than its options
the consumer narrows (`StagePanel.tsx:462`: `value={tool as Exclude<typeof
tool, "off">}`; `useAnnotations.ts:10` types it). MUI `ToggleButtonGroup` is
rejected (own grey/uppercase skin, second focus ring). Consumers: the
audience toggle (`DiscussionAudience`, `discussion-draft-loop.ts:82`), the
status chips (`ReplyStatusFilter`, `count: statusCounts[key]`), the speed
rates (`disabled={speed.busy}`), the deck/video mode switch (`"deck" |
"video"`), the annotation tool. `optionLabel` is imported from the `.tsx`
under node-env vitest, the way `AddKnowledgePages.test.ts:14` already does.
A single two-state control (Teleprompter on/off, Mute) is NOT a
SegmentedToggle: it is one MUI `Button` with `aria-pressed` and a stable
label whose variant swaps through `variantFor`.

**CC5 - One arm/confirm component, and every destructive or overwriting
action uses it.** `src/app/components/ui/ConfirmArmButtons.tsx`, new:

```ts
export default function ConfirmArmButtons(props: {
  armed: boolean;
  idleLabel: string;          // "Delete table"
  confirmLabel: string;       // "Confirm delete"
  tone: "danger" | "warning" | "primary";
  onArm: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  /** id of the consequence line the caller renders; aria-describedby on the confirm button. */
  consequenceId: string;
  /** Idle variant. "outlined" default; "text" for a low-salience overwrite
   *  (Redraft) or a row-level control; "contained" when the action is the
   *  screen's primary (Post). */
  idleVariant?: "outlined" | "text" | "contained";
  /** The in-flight state after confirm ("Posting…"): passed to MUI `loading`. */
  loading?: boolean;
  loadingLabel?: string;
  /** Non-busy gate, spelled by the caller exactly as today. */
  disabled?: boolean;
  /** Per-row accessible names where N identical labels would otherwise render. */
  idleAriaLabel?: string;
  confirmAriaLabel?: string;
}): JSX.Element;
```

The idle and armed states are **one `Button` element** whose label, variant,
colour and handler change in place (the `GradingTableRow.tsx:143-147` trick),
so focus survives arming. Idle: `color` = error / warning / primary by tone,
`variant` = idleVariant. Armed: `variant="contained"`, same colour (aesthetics
R16: Vercel's danger zone and Stripe's destructive confirms escalate to a
filled red on the confirm step; today's bare-text armed state is quieter
than idle, which is backwards), label `confirmLabel`, `aria-describedby=
{consequenceId}`, FOLLOWED by `Button variant="text" size="small"` "Cancel"
(default colour, `disabled={loading}`). Both inside `<span className=
{styles.ghActions} onKeyDown={Escape -> onCancel}>` with no `tabIndex`.
**`onCancel` moves focus to the one-element button before Cancel unmounts**
(the UX pass caught that otherwise every Cancel click drops focus to
`<body>`). The CALLER keeps the arming state (signature-based via
`content-tab/modules/confirmArming.ts` where a signature exists; a plain
boolean where the thing confirmed cannot change; `armedCueIndex: number |
null` in CaptionsList for its N cues) and renders the consequence line as
`<p id={consequenceId} role="status" aria-live="polite" className=
{controls.consequence}>` **after the whole `.ghActions` cluster, full width**.
No `onBlur` disarm on the confirm element anywhere. A destructive control is
the last item in its toolbar and is pushed to the far edge (`className=
{controls.pushEnd}` = `margin-left: auto`), so Delete table no longer sits
flush against Find resources (`DiscussionReplyToolbar.tsx:202`).

Consumers, with the confirm added where the survey found none, and every
consequence line conditional where the UX pass found it false:

| Site | Tone / idleVariant | Consequence line |
| --- | --- | --- |
| Delete table (DiscussionReplyToolbar) | danger / outlined | existing |
| Redraft every reply (rendered by `DiscussionCaptureSettings`; arming STATE, both signatures and both `*_CONSEQUENCE_ID` constants stay in the panel and cross as `redraftArmed / onArmRedraft / onConfirmRedraft / onCancelRedraft / redraftConsequenceId`, because `discussion-table-view.test.ts:757-765` pins them to the panel file) | warning / text | existing, after the Replies row |
| Clear table (GradingTable) | danger / outlined | existing |
| Remove row (GradingTableRow): when `row.userEdited` is false a plain `Button variant="text" color="error"` removes on one click exactly as `handleRemoveClick` (`:93-100`) does today; when true, ConfirmArmButtons with `idleAriaLabel`/`confirmAriaLabel` carrying the student's name | danger / text | "This removes {name}'s row and the feedback you edited." |
| Delete take (TakesPanel menu) | danger | MenuItem swap + a "Cancel" MenuItem (it lives in a `Menu`); consequence "This take is not saved anywhere else." ONLY when neither `take.backup` nor `take.dbSave` is `"done"` (`TakesPanel.tsx:200/203`), else "This removes the take from this session." |
| Delete likeness (AvatarStudioPanel) | danger / outlined | "Training took hours; this cannot be undone." when `status === "ready"` (`:481-482`), else "This removes the likeness." |
| Discard and retake (AvatarStudioPanel) | danger / text | "This discards the take; you will record it again." |
| Regenerate announcement (TakeAnnouncementPanel) - only when a panel-local `fieldsTouched` boolean (set by the Subject/Message `onChange` at `:396/:404`, cleared when the draft is regenerated) is true; no such flag exists today | warning / outlined | "This replaces your edited subject and message." - and the always-on hint at `:388` is hidden while armed so only one line shows |
| Post to Canvas (TakeAnnouncementPanel) | primary / contained, `loading={posting}` `loadingLabel="Posting…"`, `disabled={busy \|\| Boolean(postUnavailableReason)}`; `onArm` and `onConfirm` are both `handlePostButtonClick` (`useTakeAnnouncement.ts:721-733` branches on `armed`) | the armed warning box (`:499-503`) STAYS above the row; only its first paragraph carries `consequenceId` - the one consumer whose consequence sits above its cluster, because the preview it introduces is what is being confirmed |
| Remove cue (CaptionsList), Discard sample (VoiceRecordingSection), Stop using clone (VoiceCloneSection) | danger / text | one line each, in the caller |

The row-level Remove in `DiscussionReplyRow`'s More menu keeps its MenuItem
label swap but gains a "Cancel" MenuItem and a consequence sentence
announced through the existing `announce` channel AND rendered as the menu's
`aria-describedby` target. **Focus after a removal**: Remove cue
(`CaptionsList.tsx:220`) and Delete take (`TakesPanel.tsx:85`; MUI Menu would
restore to an anchor that no longer exists) adopt the keyed-ref-map idiom
from `DiscussionRepliesPanel.tsx:476-503` - focus lands on the next item's
equivalent control, else the list container (`TakesPanel` already has
`containerRef`, `:115`).

**CC6 - Busy is the MUI `loading` prop.** `@mui/material` 9.0.1: `Button` has
`loading`, `loadingPosition`, `loadingIndicator` (Button.d.ts) and
`IconButton` has `loading` and `loadingIndicator` only (IconButton.d.ts:45-56;
corrected 2026-09-02 by the step-10 researcher - no surface passes
`loadingPosition` to an IconButton); `Button.js:582` sets `disabled: disabled
|| loading`; `loadingPosition="start"` without a `startIcon` renders a
placeholder that adds ~19px of width while loading (Button.js:541-548) -
accepted, because the label swap already changes width and the reason verb
must stay visible. The indicator is `CircularProgress color="inherit"
size={16}` (Button.js:520-524): white on contained, accent on outlined - no
site passes `loadingIndicator`. Every button that starts work lasting over
~400ms renders `loading={busy}` `loadingPosition="start"` with its label
swapped to the progressive verb already in use. The button KEEPS `disabled=
{<its non-busy gate, spelled exactly as today>}` where one exists
(`TakeAnnouncementPanel:542`, `DeckModeSection:144`, `ModuleDeckCapturePanel:
823`); a `disabled` whose sole input is the busy flag goes away EXCEPT at
`AvatarStudioPanel.tsx:320` (Start camera, `disabled={capturePreviewStarting}`)
which stays beside `loading` because `avatar-script.test.ts:689-692` requires
a `disabled={` within 400 characters before "Start camera" (harmless: MUI ORs
them). A button is never REMOVED while busy (TakesPanel 152-154, StagePanel
428-430). A permanently-disabled button used as a status label (SpeedPanel
278) becomes a `.fieldHint` status line beside the progress bar. Bare
"Loading…" text for a fetch (RecordingTab 739/765/775, WalkthroughPanel 221,
AddKnowledgePages 365, SlideStudio 60, SpeedPanel 112, VideoSource 84,
AvatarStudioPanel 454) becomes the `.loadingLine` idiom (CC13): `<p
role="status" aria-live="polite" className={controls.loadingLine}><span
className={styles.spinner} aria-hidden="true" /> Loading your courses…</p>`.
A disabled select whose reason is a pending fetch (`DiscussionRepliesPanel:
595`, `GradingRecordingPanel:564`, `ModuleDeckCapturePanel:677`) gets that
line. **Reported, not fixed:** MUI's disabled style is a colour swap to grey
(Button.js:143-147), so a loading primary turns grey; AM11 wants
`opacity: .5`. That is a `MuiButton` styleOverride app-wide, outside this
group; recorded as a follow-up in section 7.

**CC7 - Names and sizes.** Every icon-only control carries `aria-label` AND
`title` (DiscussionReplyRow 678 and 882, GradingTable 115). Two controls in
one row never share an accessible name (CaptionsList "Set" x2 -> "Set start
to playhead" / "Set end to playhead"; the nudge buttons gain `aria-label`s
that say which edge: "Start earlier by half a second"; "Jump" -> "Jump to
this cue"). Cue time fields (`CaptionsList.tsx:102-110, 137-145`) get
`htmlInput.step = 0.1` so arrow keys move a tenth of a second instead of a
whole one. Icons are 16px in dense rows and 20px in toolbars per AM11, with
`recording/discussion-icons.tsx` staying at 20px per AM23 (its SVGs carry
`width="20"` attributes, so MUI's 18px `startIcon` slot does not shrink
them). Labels are sentence case; "&" is spelled "and"; the leading "+" glyph
(AddKnowledgePages 342) goes. "REC" at `VoiceRecordingSection:105` and
"REC"/"PAUSED" at `StagePanel:575` stop borrowing `.navBadge` and use
`.recIndicator` (+ `.recIndicatorPaused`) from the shared stylesheet.

**CC8 - One run-log row.** `src/app/components/recording/RunLogRow.tsx`, new:

```ts
export default function RunLogRow(props: {
  summary: string;
  onDownload: (format: "csv" | "json") => void;
  formats?: readonly ("csv" | "json")[];   // default both
}): JSX.Element;
```

Renders `<div className={controls.runLogRow}>` holding the summary span and
one `Button variant="text" size="small"` per format labelled "Download run
log (CSV)" / "(JSON)" - no `style={{ minWidth: 0 }}` (both labels exceed
MUI's 64px minimum; it was a no-op). Placement unchanged: directly under the
panel header. The five callers' `handleDownloadLog(format)` already match:
`DiscussionRepliesPanel.tsx:249-258`, `GradingRecordingPanel.tsx:516`,
`LegibilityProbeModal.tsx:207`, `ModuleDeckCapturePanel.tsx:632-638`,
`TakeAnnouncementPanel.tsx:189-199` (its `downloadLogRow` element becomes
`const downloadLogRow = <RunLogRow .../>`). Wiring tests that pin the
literal: `ModuleDeckCapturePanel.wiring.test.ts:219-226` needs BOTH anchors
widened (`<RunLogRow` for the log literal AND `<ModuleDeckSettings` for
"Course (where the deck is saved)", since both leave the panel) with a canary
that the old literals still satisfy; `:254-256` asserts `/token/i` is absent
with only `//` comments stripped, so **group M writes no JSX block comment
containing the word "token"**.

**CC9 - The sub-tab strip is fully wired.** In `RecordingTab.tsx` each tab
button gets `id={"rec-tab-" + key}` and `aria-controls={"rec-panel-" + key}`;
each content div gets `role="tabpanel"`, `id={"rec-panel-" + key}`,
`aria-labelledby={"rec-tab-" + key}`. The record/announcement pair shares ONE
wrapper (`:619`): it carries `id="rec-panel-record"` and `aria-labelledby=
"rec-tab-record rec-tab-announcement"`, and the announcement tab's
`aria-controls` points at it. The strip's array literal stays on ONE line
(`recording-split.structure.test.ts:122-128`). Labels unchanged.

**CC10 - Persistence.** No existing `ta-` key changes meaning or file. Two
new keys, both booleans: `ta-rec-options-open` (SourceDevicesPanel's
"Recording options" `<details>`) and `ta-rec-script-open` (LectureScriptPanel's
disclosure). Mechanics, pinned because `useRecordingSettings.ts` is outside
group R and the canary accepts only three call shapes: each panel reads with
`localStorage.getItem("<key>")` inside a `useState` initializer (guarded by
`typeof window` and try/catch - REGRESSION 382's white-screen lesson) and
writes with `localStorage.setItem("<key>", String(open))` in an effect on
the `<details>` `onToggle`. Group T widens `recording-split.structure.test.
ts:247-308`'s exact set from 59 to 61 (JS sort places them after
`ta-rec-noise` and after `ta-rec-script-objectives`) and adds ONE new `it()`
using the existing `isWired()` helper (`:214-237`) for read AND write on
both. The four `ta-rec-mod-*` reads and writes stay in `ModuleDeckCapture
Panel.tsx` (`ModuleDeckCapturePanel.wiring.test.ts:50-80`). The two "Voice
name" fields stay as they are (revision 1's hoist withdrawn).

**CC11 - Notices and errors.** Bare `<p className={styles.error}>` stops being
the error idiom on these surfaces. An error or warning the instructor must
act on renders in the notice shape from CC13 (`.notice` + `.noticeDanger` /
`.noticeWarning`): text stays `--text-primary` - the surface carries the
status, never red prose on a pink surface; no icon. **Placement (AM11):** the
first child after the panel header; `ModuleDeckCapturePanel.tsx:755-820`'s
five scattered `.error` paragraphs consolidate into that slot. **Roles:** the
discussions notice LIST (`DiscussionRepliesPanel.tsx:559-570`) has ONE
wrapper with `role="status" aria-live="polite"` and no role on items;
grading and module deck keep their per-notice `role="alert"` for danger
kinds because that is a documented decision (`GradingRecordingPanel.tsx:
680-690`); a single standalone failure notice (SpeedPanel 312) carries
`role="alert"`; the stalled line (`DiscussionRepliesPanel:754`,
`GradingRecordingPanel:675`, `ModuleDeckCapturePanel:791`,
`LegibilityProbeModal:292`) becomes `.noticeWarning` with `role="status"`.
The two ad-hoc inline warning boxes in TakeAnnouncementPanel (291, 500)
become `.noticeWarning`. An inline per-field validation message stays a
field-level `.replyErrorText` line at `--font-size-md`; the resource-search
failure at DiscussionReplyRow 835 joins it.

**CC12 - Status text reaches assistive tech.** The capture status column
moves OUT of the `aria-hidden` wrapper in GradingRecordingPanel,
ModuleDeckCapturePanel and LegibilityProbeModal; only the `<video>` stays
hidden. Group P adds `recording/captureLiveRegion.ts` exporting
`composeCaptureLiveSentence(args: { count: number; noun: { one: string;
many: string }; extracting: boolean; pendingFrames: number; stalled:
boolean; capturing: boolean }): string` (the file-local function at
`DiscussionRepliesPanel.tsx:101-118`, parameterised) and
`useThrottledLiveSentence(sentence: string, minIntervalMs = 5000): string`
(the effect at `:383-401`: cancelled flag, await the remainder of the window,
then setState - the repo's setState-in-effect idiom; measured ceiling 12
announcements per minute per region regardless of input rate); and
`ui/visuallyHidden.ts` exporting `visuallyHidden: React.CSSProperties`
(`:89-99`; `DiscussionReplyRow.tsx:90` has a second copy). Discussions adopts
all three (`noun: { one: "post", many: "posts" }`); Grading adopts all three
(`{ one: "submission", many: "submissions" }`, `GradingRecordingPanel.tsx:
666-668`); Module deck (`:780`) and the probe (`LegibilityProbeModal.tsx:288`)
keep their own sentence copy unchanged (CC16) and adopt only the hook and
the style, rendering the same `<span role="status" aria-live="polite"
style={visuallyHidden}>`.

**CC13 - One new shared stylesheet, `src/app/components/recording/
RecordingControls.module.css`**, owned by group P, imported as `controls`,
holding exactly these classes and nothing else (every value from the
aesthetics pass, cited there):

| Class | Rule |
| --- | --- |
| `.section` | `border: 0; margin: 0; padding: 0; min-width: 0; display: flex; flex-direction: column; gap: var(--space-2)` - the fieldset reset. `gap` is `--space-2`, not `--space-3`, because `.adaptRow + .adaptRow { margin-top: var(--space-2) }` (page.module.css:897) ADDS to it and cannot be neutralised from another module, giving 16px between rows (= `WorkflowPanel.module.css:74`). The rendered `<legend>` is not a flex item, so its own margin is the only spacing under it. **No descendant `legend` or `fieldset` selector anywhere in this file** (MUI's OutlinedInput renders its own `<fieldset><legend>`, `NotchedOutline.js:15/34`). |
| `.section + .section` | `border-top: 1px solid var(--border-soft); padding-top: var(--space-4)` (AM11; symmetric with `.adaptPanel`'s 16px column gap) |
| `.sectionLegend` | `padding: 0; float: none; margin: 0 0 var(--space-3)` plus ALL FIVE declarations of `.field label` (page.module.css:154-160): 2xs / 700 / 0.06em / uppercase / `--text-secondary` - matching the app's one existing fieldset idiom, `WorkflowPanel.module.css:54-62` |
| `.runRow` | `padding-top: var(--space-4); border-top: 1px solid var(--border-soft)` (composed with `.ghActions`) |
| `.fieldXs/.fieldSm/.fieldMd/.fieldLg` | `min-width` 80/120/220/320px; `.fieldGrow` `flex: 1 1 300px` |
| `.fieldRowButton` | `align-self: stretch` |
| `.pushEnd` | `margin-left: auto` |
| `.segmented` / `.segment` / `.segmentSelected` | copied byte-for-byte from `.lessonInnerTabs` / `.lessonInnerTab` / `.lessonInnerTabActive` (page.module.css:3712-3742; the `transition` values become `var(--transition-fast)`), plus `.segment:disabled { opacity: .5; cursor: not-allowed }` and `.segment:focus-visible { outline: 2px solid var(--focus-ring-color); outline-offset: -2px }` (negative offset for the clipping reason theme.ts:63-84 records for Tabs). `.segmentSelected`'s `--shadow-sm` on a non-floating element is a recorded AC4 exemption: it IS the raised-segment idiom the strip ships, and the two must stay identical. |
| `.runLogRow` | `display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); margin: 0 0 var(--space-1); font-size: var(--font-size-sm); color: var(--text-secondary)` - `sm`, because the two text buttons beside it are 13px |
| `.loadingLine` | `display: flex; align-items: center; gap: var(--space-2); font-size: var(--font-size-md); color: var(--text-secondary)`, plus `.loadingLine > :first-child { margin-top: 0 }` (cancels `.spinner`'s `margin-top`, page.module.css:128) |
| `.consequence` | lifted verbatim from `DiscussionRepliesPanel.module.css:206-210` (D1 deletes its copy) |
| `.notice` | copied from `.kbWarnBanner` (page.module.css:6682-6693) so the two are identical: `display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); border-radius: var(--radius-md); border: 1px solid var(--border-soft); background: var(--surface-muted); color: var(--text-primary); font-size: var(--font-size-md); line-height: var(--line-normal)` |
| `.noticeDanger` / `.noticeWarning` | `border-color: var(--danger-border); background: var(--danger-surface)` (globals.css:187-188) / `border-color: var(--warning-border); background: var(--warning-surface)` (globals.css:189-190) |
| `.recIndicator` / `.recIndicatorPaused` | `display: inline-flex; align-items: center; gap: var(--space-1); font-size: var(--font-size-xs); font-weight: 600; color: var(--danger-ink)`; `::before` an 8px `--radius-round` dot in `var(--danger)`; under `@media (prefers-reduced-motion: no-preference)` the dot animates a SAME-FILE `@keyframes recPulse` (opacity 1 -> .25 -> 1, 1.4s ease-in-out) - never a keyframe name from another module (AM10). Paused: `color: var(--text-secondary)`, dot `var(--text-muted)`, no animation. |
| `.statusRow/.statusText/.previewVideo` | lifted from `DiscussionRepliesPanel.module.css:15-40` (the tokenised copy: `--radius-md`, `--field-border`, `var(--navy)` - NOT the probe's raw `#000`) with `width: 240px`; `DiscussionRepliesPanel.module.css:15-40` and `LegibilityProbeModal.module.css:12-41` DELETE their copies in the same wave. `.stickyToolbar` stays where it is. |
| `.uploadLabel:has(:focus-visible)` | `outline: 2px solid var(--focus-ring-color); outline-offset: 2px` (CC15) |

**The orphan-class ratchet** (`courses/page-module-css-orphan-classes.test.ts:
273,334`) pins the repo-wide orphan count to EXACTLY 137 and fails on a fall
as well as a rise. The literal is NOT edited: after wave 1 the measured count
must equal 137 - every lifted class was live before and is live after, and
every new class has a consumer. Above 137 names an unconsumed class (wired or
deleted, never pinned); below 137 means a vacated class was deleted while a
sibling copy is still referenced, or a reference uses a spelling the test's
`<localName>.<class>` regex (`:201`) cannot see. Group P's own gate is
expected red on this one test at wave 0 - P reports the number and nothing
else.

**CC14 - Rows and tables (Discussion replies, Grading).** The per-row action
cluster is one vocabulary: Copy reply `outlined small` (unchanged), the
Redraft button (section 10) `outlined small`, the More `IconButton` with
`title`, the hover-reveal reorder pair with `aria-disabled` AND `cursor:
not-allowed` when refused. The `<th>Actions` header (`DiscussionReplyTable.
tsx:223`) right-aligns to match `.rowActions`. Sort glyphs render dimmed on
the inactive sortable columns. Danger on a `Button` is `color="error"`; on a
`MenuItem` it is `sx={{ color: "var(--danger)" }}`. `DiscussionReplyRow.tsx:
856`'s inline row becomes `.ghActions` plus a residual `style={{ minWidth:
0 }}`. Grading rows gain the one control the sibling has and they lack: a
"Copy feedback" `outlined small` button per row, accessible name "Copy
feedback for {name}", rendered after the Overall comment field, joining the
three feedback fields with blank lines and omitting empty ones and the score
via `joinFeedback(row)` in `grading-recording/grading-row.ts`; its icon swaps
to the check for two seconds after a copy exactly as Copy reply does
(`DiscussionReplyRow.tsx:614-630`) - no persisted "handled" state is added
(a follow-up, section 7). No shared clipboard helper exists today:
`DiscussionRepliesPanel.tsx:351-352`, `DiscussionReplyRow.tsx:348` (copy
reply) and `:378-379` (copy post) each inline the same guard. Group P adds
`src/app/components/ui/clipboard.ts` exporting `writeClipboardText(text:
string): Promise<void>` (throws `Error("clipboard unavailable")` under the
same guard); the three discussion sites and the new grading site call it.

**CC15 - Keyboard.** RubricInputModal's upload adopts MUI's own recipe: the
`<Button component="label" tabIndex={-1} className={controls.uploadLabel}>`
wraps a visually-hidden (NOT `display:none`) `<input type="file">` that keeps
its natural tab stop, and `.uploadLabel:has(:focus-visible)` paints the ring.
(Corrected by the step-10 researcher, 2026-09-02: with a string `component`
that is not `"button"`, `ButtonBase.js:144-145` resolves `nativeButton=false`
and `useButtonBase.js:100-104` DOES set `role="button"`, which is why the
label passes `role={undefined}` - the explicit undefined wins because
`ButtonBase.js:284-285` spreads the caller's props last. The label's own
Enter handler is unreachable behind `tabIndex={-1}`; the file picker opens
through the input's native keyboard behaviour.) The drop zone stays pointer-only but is
no longer the ONLY path. The announcement confirm preview
(`TakeAnnouncementPanel.tsx:511`) gets `tabIndex={0}` `role="group"` and an
`aria-label`, the same shape as `DiscussionReplyRow`'s post scroller.
`LinearProgress` (`:266`) gets `aria-labelledby` pointing at its descriptive
line.

**CC16 - No behaviour change beyond this list.** Props, handlers, state,
effects, network calls and copy semantics are unchanged except where a
criterion above names the change: the added confirms; Copy feedback; the two
new persisted disclosure states; the loading prop replacing a busy-only
disabled; the status column leaving aria-hidden; the Regenerate-announcement
confirm and its `fieldsTouched` flag; the stock-voice section reordered to
load -> pick -> use; the legend label edits (ordinals dropped); `step 0.1` on
cue time fields; the redraft button (section 10). Section 7 lists the
non-controls defects and the follow-ups.

**CC17 - Line ceiling.** Measured 2026-09-02: `DiscussionRepliesPanel.tsx` 930,
`DiscussionReplyRow.tsx` 917, `useReplyRows.ts` 940, `useRecorder.ts` 920,
`useTakeAnnouncement.ts` 915, `ModuleDeckCapturePanel.tsx` 850,
`GradingRecordingPanel.tsx` 762, `StagePanel.tsx` 691, `AvatarStudioPanel.tsx`
595, `TakeAnnouncementPanel.tsx` 563. The architect's estimates after the
group: panel ~800, row ~865 WITH the extraction below (~942 without),
module deck ~805, grading panel ~785, SourceDevicesPanel ~555, RecordingTab
~885; nothing else near 900.

- D1 FIRST extracts `DiscussionRepliesPanel.tsx:588-687` (course, save video,
  audience row with the redraft cluster and its consequence) and `:701-716`
  (`<DiscussionReplyControls` at :701 and `<DiscussionResourceSettings>`)
  into `DiscussionCaptureSettings.tsx` with the props the architect listed:
  `courseId/setCourseId/courses/coursesLoading/coursesError`, `saveVideo/
  setSaveVideo`, `audience/setAudience`, `totalCount` (the `.reservedSlot`
  visibility, `:646`), `redraftArmed/onArmRedraft/onConfirmRedraft/
  onCancelRedraft/redraftConsequenceId`, `composition/onChangeComposition`,
  `resourceKinds/onChangeResourceKinds`, `videoLengthMinMinutes/
  videoLengthMaxMinutes/onChangeVideoLength`, `children`. It imports
  `DiscussionRepliesPanel.module.css` for `.reservedSlot` only. **Lines
  689-700 stay in the panel source** and are passed as `children`
  (`AddKnowledgePages.test.ts:261-273`, `discussion-knowledge-context.test.ts:
  376-394`); the arming state, both signatures (`:408-409`, `:449-458`) and
  both `*_CONSEQUENCE_ID` constants stay in the panel (`discussion-table-
  view.test.ts:757-765`). The panel also keeps `primaryAction`.
- D2 extracts the resource list (`DiscussionReplyRow.tsx:830-908`, ~78
  lines) into `DiscussionReplyResources.tsx` UNCONDITIONALLY (the architect
  counted CC14 + CC20 + the menu Cancel at ~942 without it).
- M extracts ONLY `ModuleDeckCapturePanel.tsx:670-733` minus `:709-714` into
  `ModuleDeckSettings.tsx` with props `courseId/setCourseId/courses/
  coursesLoading/coursesError`, `moduleLabel/setModuleLabel`, `templateId/
  setTemplateId/templates/templatesError`, `contextText/setContextText/
  maxContextChars/contextPersistError`; the template select sits alone in
  the Deck section's `.adaptRow`; the new file carries no `ta-` text
  (`module-deck-capture.structure.test.ts:137-152` scans it and pins the
  directory's distinct-key count at 4).
- Every touched file is counted with `@(Get-Content path).Count` at
  verification and reported.

**CC18 - Gates and invariants.** `npx tsc --noEmit`, `npx eslint <touched>`,
`npx vitest run`: 0 errors AND 0 warnings, with two documented exceptions
at wave 0 only: P's orphan-ratchet reading (CC13) and the three cross-file
canaries that are frozen after wave 1 (section 6). No emojis (the committed
test). No new dependency (`package.json` untouched - the data pass
confirmed every new file imports only React, `@mui/material` and the app's
CSS modules). No `role="dialog"` or `ModalShell` import added
(`ui/modalAdoption.wiring.test.ts` canaries: 50 and 35). No test assertion
weakened; a source-text scanner may be WIDENED with a canary per new
spelling (AM21). `"use server"` files untouched. The nine-tab strip literal
stays one line. Dark mode follows from tokens; no `data-theme` block
anywhere. Other pins the wave touches, named so the briefs carry them:
`caption-studio-wiring.structure.test.ts:120-122` requires `onAbortBurn={...
=> ...}` and `:87` scans every `, [ ... ])` for hook-result names (group S);
`page-module-css-classes.test.ts:331` goes red if D1/G delete a class but
leave a `panelStyles.`/`modalStyles.` reference.

---

## 2. Reuse survey (verified by reading the definition AND a call site)

| Need | Reuse | Where |
| --- | --- | --- |
| Wrapping field row, bottom-aligned | `.adaptRow` (+ `.adaptRow + .adaptRow` margin) | page.module.css:890-899 |
| Wrapping button row | `.ghActions` | page.module.css:1574-1580; DiscussionRepliesPanel.tsx:618/718/823 |
| Panel frame + header | `.adaptPanel/.adaptPanelHeader/.adaptPanelTitle/.adaptPanelSubtitle` | page.module.css:903-948 |
| Micro-label idiom for legends | the five declarations of `.field label`; the fieldset precedent | page.module.css:154-160; WorkflowPanel.module.css:54-62 |
| Segmented track idiom | `.lessonInnerTabs/.lessonInnerTab/.lessonInnerTabActive` and the roving-tabindex handler | page.module.css:3712-3742; RecordingTab.tsx:585-598 |
| Helper text | `.fieldHint` | page.module.css:258-262 |
| Inline text button | `.linkButton` (+ `:disabled` at :817) | page.module.css:800-820 |
| Spinner | `.spinner` (uses `--ta-spin-animation`) | page.module.css:125-133; globals.css:276 |
| Notice surfaces | `.kbWarnBanner`'s recipe; `--danger-surface/--danger-border` (globals.css:187-188); `--warning-surface/--warning-border` (189-190); `--surface-muted` (:65) | page.module.css:6682-6693 |
| Pulse keyframe values | opacity 1 -> .25 -> 1 over 1.4s (values only; the keyframe is re-declared in the new file per AM10) | page.module.css:4264-4267 |
| Signature-based arming | `isConfirmArmed`, `selectionSignature` | content-tab/modules/confirmArming.ts:20-28; DiscussionRepliesPanel.tsx:457-458 |
| Drafting arm signature | `draftingArmSignature` | recording/discussion-capture.ts:791; imported at DiscussionRepliesPanel.tsx:18 |
| One-element arm/confirm button | the label/handler swap on a single Button | GradingTableRow.tsx:143-147 |
| Focus after removal | keyed ref map + container fallback | DiscussionRepliesPanel.tsx:476-503 |
| Copy icons at 20px | `discussion-icons.tsx` (`width="20"` attributes) | recording/discussion-icons.tsx:26-83 |
| Clipboard copy | NO shared helper; three inline copies | DiscussionRepliesPanel.tsx:351-352, DiscussionReplyRow.tsx:348, :378-379 |
| Throttled live region | file-local `composeLiveSentence` (:101-118), the effect at :383-401, `visuallyHidden` (:89-99) | DiscussionRepliesPanel.tsx |
| Status/preview classes to lift | `.previewVideo/.statusRow/.statusText` (two copies, differing values) | DiscussionRepliesPanel.module.css:15-40 (tokenised; wins), LegibilityProbeModal.module.css:12-41 (raw `#000`; deleted) |
| MUI button defaults | `textTransform: none`, radius 8, weight 600, `disableElevation` | src/app/theme.ts:86-91 |
| MUI `loading` | Button and IconButton; `disabled \|\| loading`; 16px inherit-colour indicator | Button.d.ts, Button.js:520-524/541-548/582, IconButton.d.ts:49 |
| MUI `component="label"` keyboard | `ButtonBase.js:145/176`, `useButtonBase.js:95-105/147-150` | node_modules/@mui/material |
| Persisted-key canary and `isWired()` | `recording-split.structure.test.ts` | :164-237, :247-308 |
| Orphan-class ratchet | `courses/page-module-css-orphan-classes.test.ts` (exact 137 at :273/:334; regex at :201) | orchestrator-owned |
| Disclosure frame | `.adaptDisclosure` + `.adaptDisclosureBody` | page.module.css:848-886 |
| Download helper | `triggerFileDownload(blob, filename)` | course-planning/utils.ts:19-28 (unchanged) |

Not reusable, and why: MUI `ToggleButtonGroup` (own skin, second focus ring);
`.submitButton` (legacy pill); `.ccItemName` (written for a native input;
TakesPanel 132 applies it to a MUI FormControl root where its `height`/
`:focus` never match - TakesPanel drops it for a plain `TextField
size="small"` in a `.fieldGrow`); `.lessonInnerTab*` by import (no
`:disabled` rule and page.module.css is frozen this group - hence the copy);
`selectionChatPulse`/`.liveRecordingDot` (page.module.css:4271; a keyframe
name from another module compiles to a dead hash).

---

## 3. Click-cost decisions (designed at 4b, checked at 8 and 8b)

| Flow | Today | After | How |
| --- | --- | --- | --- |
| Draft 30 replies and copy them into Canvas | 2 + 30 per-row copies (drafts auto-enqueue) | unchanged | the per-row Copy is the job; Copy all stays secondary |
| Fix one bad reply | 2 (Redraft every reply, overwriting all 30) or retype | 1 (2 if hand-edited or already copied) | section 10 |
| Change a setting under "Recording options" on a repeat session where it was left open | 2 | 1 | CC10 |
| Toggle the teleprompter, same condition | 2 | 1 | CC10 |
| Copy one student's feedback (grading) | ~9 interactions across three fields | 1 | CC14 |
| Nudge one cue edge (captions) | 1 | 1, plus arrow keys at 0.1s | CC7 |
| Stock voice first run | read backwards (select, use, then load) | same clicks, correct order | reorder |
| Cancel an armed confirm | 1 | 0 (Escape) or 1 | CC5 |
| Delete take, Delete likeness, Discard and retake, Regenerate announcement (edited), Remove cue, Discard sample, Stop using clone, Redraft (edited/copied row) | 1 | 2 | CC5 - eight confirms ADDED, each on a destructive or overwriting action; these are clicks deliberately spent |
| Every other flow | unchanged | unchanged | - |

Confirmations that must stay: Delete table, Clear table, Remove row, Post to
Canvas, Redraft every reply, row Remove in the More menu. None is removed.

---

## 4. The disjoint split (final, per the architect)

Orchestrator-owned, edited before wave 0: `src/app/page.module.css` (the
`.lessonInnerTabs` wrap - already in); **`src/app/theme.ts`**: `warning:
{ main: "#92400e" }` in the light scheme (= `--warning-ink`, 7.1:1 on white
and with white text) and `warning: { main: "#fbbf24" }` in the dark scheme
(MUI derives its contrast text), because MUI's default `#ed6c02` is 3.1:1 and
every CC5 warning consumer would ship a contrast failure; `courses/
page-module-css-orphan-classes.test.ts` (read only; see CC13);
`docs/REGRESSION.md`. `globals.css` is not touched.

Wave 0 (two agents, concurrent, disjoint):

| Group | Files |
| --- | --- |
| P - shared primitives | NEW `ui/SegmentedToggle.tsx`, `ui/ConfirmArmButtons.tsx`, `ui/buttonVariant.ts`, `ui/clipboard.ts`, `ui/visuallyHidden.ts`, `recording/RunLogRow.tsx`, `recording/captureLiveRegion.ts`, `recording/RecordingControls.module.css`; tests `ui/segmentedToggle.test.ts`, `ui/confirmArmButtons.test.ts`, `ui/buttonVariant.test.ts` (pure assertions + the scanner's own fixture self-test only), `ui/clipboard.test.ts`, `recording/captureLiveRegion.test.ts`. No `ta-` text in any new `recording/*` file (`recording-split.structure.test.ts:174-188` scans them). |
| H - the redraft type thread (section 10) | `recording/useDiscussionReplies.ts` (add `redraftRow` beside `retryRow` :683-702, return at :834), `recording/discussion-draft-loop.ts` (type beside :226), `recording/discussion-capture.ts` (`DraftDispatchSource` :405, `draftDispatchForce` :408), `recording/discussion-capture.test.ts:339-345`, PLUS the type-only thread so wave 1 has no intra-wave dependency: `DiscussionRepliesPanel.tsx` (destructure + pass, two lines), `DiscussionReplyTable.tsx` (prop declared and forwarded as `onRedraft`), `DiscussionReplyRow.tsx` (prop declared in `DiscussionReplyRowProps` :133-212 only, NOT destructured, so no unused-var lint). `tsc` green with `redraftRow` typed everywhere and rendered nowhere. D1/D2 re-edit those three files in wave 1. |

Wave 1 (concurrent, after wave 0 is on disk and `tsc` is clean):

| Group | Surface | Files |
| --- | --- | --- |
| D1 | Discussion replies, panel level | `recording/DiscussionRepliesPanel.tsx`, NEW `recording/DiscussionCaptureSettings.tsx`, `recording/DiscussionReplyControls.tsx`, `recording/DiscussionResourceSettings.tsx`, `recording/DiscussionReplyToolbar.tsx`, `recording/DiscussionRepliesPanel.module.css` |
| D2 | Discussion replies, rows | `recording/DiscussionReplyRow.tsx`, `recording/DiscussionReplyTable.tsx`, `recording/discussion-icons.tsx`, NEW `recording/DiscussionReplyResources.tsx` |
| R | Record | `recording/SourceDevicesPanel.tsx`, `recording/LectureScriptPanel.tsx`, `recording/StagePanel.tsx`, `recording/TakesPanel.tsx`, `recording/WalkthroughPanel.tsx` |
| A | Announcement | `recording/TakeAnnouncementPanel.tsx`, `recording/AnnouncementCompositionControls.tsx`, `recording/AddKnowledgePages.tsx`, `recording/CarriedKnowledgePages.tsx` |
| G | Grading | `grading-recording/GradingRecordingPanel.tsx`, `GradingTable.tsx`, `GradingTableRow.tsx`, `GradingTable.module.css`, `RubricInputModal.tsx`, `LegibilityProbeModal.tsx`, `LegibilityProbeModal.module.css`, `grading-row.ts` (+ `joinFeedback` test), `GradingRecordingPanel.wiring.test.ts` (widen only) |
| M | Module deck | `module-deck-capture/ModuleDeckCapturePanel.tsx`, NEW `module-deck-capture/ModuleDeckSettings.tsx`, `module-deck-capture.structure.test.ts` (widen the ordinal canary), `ModuleDeckCapturePanel.wiring.test.ts` (widen the two ordering anchors only) |
| S | Speed + Captions | `recording/SpeedPanel.tsx`, `caption-studio/CaptionStudio.tsx`, `VideoSource.tsx`, `CaptionsList.tsx`, `PreviewExport.tsx`, `caption-studio-wiring.structure.test.ts` (widen only) |
| N | Narrate + Avatar | `slide-studio/SlideStudio.tsx`, `DeckModeSection.tsx`, `VideoModeSection.tsx`, `StockVoiceSection.tsx`, `VoiceCloneSection.tsx`, `VoiceRecordingSection.tsx`, `recording/AvatarStudioPanel.tsx` |
| T | Tab strip + wiring | `RecordingTab.tsx` (CC9; the library picker block 743-780 adopts `.adaptRow`/CC3), `recording/recording-split.structure.test.ts` (the 61-key set, the `isWired` block for both keys, the nine-and-nine tabpanel assertion) |

Between waves, orchestrator-owned: `git status --short` against the
assignment lists; the orphan ratchet must read exactly 137;
`page-module-css-classes.test.ts:331`; the exact key sets (61 recording, 4
module-deck); freezing the three cross-file canaries (section 6); the
modal-adoption canaries 50/35. Intra-wave TEST dependency accepted: R writes
the two keys while T widens the set - the suite is red until both are on
disk and is run by the orchestrator after the wave, not per agent.

Cross-group contracts wave 1 codes against WITHOUT reading a sibling's file:
the signatures in CC1, CC4, CC5, CC8, CC12, CC14; the class list in CC13; the
two key names in CC10; `redraftRow: (id: string) => void` and the `onRedraft`
row prop (H, on disk before wave 1); `primaryAction` (D1 owns both sides).

---

## 5. What every implementer brief carries

- Read this document and `docs/aesthetics-pass-acceptance-criteria.md` 4b in
  full first. Read the survey table for your surface (section 0) and go to
  every cited line.
- You are an expert ed-tech contributor: an instructor at 11pm before grades
  are due uses these controls; accessibility is an obligation; a control the
  instructor cannot find or reach is a defect whether or not it compiles.
- Your exact file list, and that every other file belongs to a sibling. No
  git writes of any kind. Return the list of files you actually touched.
- Say what you had to guess. Say where you refused a line of this document
  and why - refusals with reasons have been right five times in this repo.
- Gates before reporting: `npx tsc --noEmit`, `npx eslint <your files>`,
  `npx vitest run` - 0 errors AND 0 warnings. Count your files with
  `@(Get-Content path).Count` and report the numbers.
- Frame the result as a rival vendor would: what in this diff would they
  screenshot?

---

## 6. Tests this group adds (sabotage-checked at step 9)

- `ui/segmentedToggle.test.ts`: `optionLabel` renders " (N)" only when `count`
  is a number (0 included); source-text: every option renders `aria-pressed`,
  the wrapper has `role="group"`, `aria-labelledby` when `showLabel` and
  `aria-label` otherwise, and exactly one segment has `tabIndex={0}`.
- `ui/buttonVariant.test.ts`: `variantFor(true) === "contained"`,
  `variantFor(false) === "outlined"`, plus the scanner's fixture self-test.
  **Frozen after wave 1 by the orchestrator** (the architect: they assert the
  END state and cannot be green at wave 0): the ternary canary - across
  section 4's file lists the literal `? "contained" : "outlined"` appears in
  `buttonVariant.ts` and nowhere else; the one-primary canary - per file, a
  frozen count of static `variant="contained"` (excluding `color="error"` /
  `"warning"` on the same element) PLUS `variantFor(` sites PLUS
  `idleVariant="contained"` sites (today's per-file numbers are in the data
  pass report: 37 static, 13 files expected to change).
- `ui/confirmArmButtons.test.ts`: armed renders "Cancel" AFTER the confirm and
  `aria-describedby`; idle renders neither; tone maps to colour; Escape calls
  `onCancel`; `onCancel` focuses the button; and `onBlur` never appears on the
  same element as `aria-describedby={...consequenceId}` in any consumer
  (element-scoped: `CaptionsList.tsx:108/143`, `TakesPanel.tsx:139`,
  `PreviewExport.tsx:161` blur-commit legitimately).
- `ui/clipboard.test.ts`: throws when `isSecureContext` is false or
  `navigator.clipboard` is absent; resolves otherwise (both mocked).
- `recording/runLogRow.test.ts` (**frozen after wave 1**): exactly five
  `<RunLogRow` sites in the five NAMED panels (not repo-wide - a sixth label
  copy lives in `drafted-grades/`), each passing `summary` and `onDownload`.
- `recording/captureLiveRegion.test.ts`: `composeCaptureLiveSentence` pins the
  fact and ordering of the four states with a fixture in the shape the
  panels emit (both nouns); `useThrottledLiveSentence` is source-text-checked
  for the await-before-setState idiom.
- `recording-split.structure.test.ts`: the 61-key set; `isWired` read AND
  write for both new keys; nine `aria-controls` and nine `role="tabpanel"`
  (exact counts).
- `grading-recording`: `joinFeedback(row)` with a fixture matching what
  `GradingTableRow` emits (three fields, blank-line separated, empty omitted,
  score excluded).
- `module-deck-capture`: the widened anchors keep a canary that the OLD
  literals still satisfy.
- Every count canary bumped in the same commit as the change it counts.

---

## 7. Not controls, found anyway - and follow-ups recorded so they are not lost

Fixed in this group: `VideoModeSection.tsx:152` "Remove audio" never calls
the setter (group N, one line + a pure test); `RubricInputModal.tsx:3-17`'s
stale reachability header (group G); `PreviewExport.tsx:153` commits the
library name only on blur - group S adds Enter-to-commit (`TakesPanel.tsx:
132`'s idiom).

Follow-ups, NOT this group: `SpeedPanel.tsx:73-199` duplicates
`VideoSource.tsx:50-165` with a divergent busy gate; MUI's disabled/loading
grey swap app-wide vs AM11's opacity rule (a `MuiButton` styleOverride in
theme.ts); `theme.ts:93`'s `0.9rem` is off the type scale (AC1) and is why
the small TextField is 37.7px; a persisted "copied" state for grading rows
(the sibling's `handledAt`); copy-then-advance focus after a per-row copy;
a two-click Record (preview + countdown together); undo instead of confirm
for Remove cue / Remove row; `.ccBarLabel`'s `opacity: .75` and
`.ccBarDivider`'s `--card-border` (page.module.css:5426-5439) and
`CoursesTable.module.css:654-667`'s bare-text panel errors, all seams the
aesthetics pass named in files no group owns; `KnowledgeBulkBar.tsx:72,126,
135,141`'s redundant `sx` 34px heights (its slot already holds 34px), which
put a 3.25px step between it and the panel it launches.

---

## 8. Downloadable logs

This group adds no run. The five run-log rows are re-homed (CC8), not
changed. Confirms, toggles and section headers have no run and need no log.

---

## 10. Mid-session addition (2026-09-02): a per-reply Redraft button

Owner: "i need a button for each reply that manually regenerates it."
Surveyed 2026-09-02 (cited):

- "Retry draft" (`DiscussionReplyRow.tsx:631-639`) renders only when
  `row.state === "failed"` and calls `retryRow` (`useDiscussionReplies.ts:
  683-702`): append a log retry event (`:698`), then `enqueueDrafts([id],
  draftDispatchForce("retry"))` (`:699`). "Redraft every reply" calls
  `redraftAll` (`:719-732`), which bumps `tableEpochRef` (`:722`) and logs
  nothing.
- The drain (`discussion-draft-loop.ts:474-685`) filters only by
  `isDispatchableDraftItem` = `item.force || !row.userEdited`
  (`discussion-capture.ts:370-372`) - no state check, so a forced enqueue of
  a `ready` row already re-drafts it. `markDrafting` keeps `userEdited`,
  `handledAt`, `skipped`, `resources` (`useReplyRows.ts:678-700`);
  `applyReply` resets `userEdited` to false when the draft lands
  (`:722-734`); the textarea is fully controlled on `row.reply`
  (`DiscussionReplyRow.tsx:784-805`). The draft loop does NOT yield during a
  live capture (`useDiscussionReplies.ts:474, 501-503`); only the resource
  drain does (`useReplyResources.ts:398`).
- `draftDispatchForce`'s source set is pinned by `discussion-capture.test.
  ts:339-344`. `retryRow` appears in no test. The row is `memo`'d
  (`DiscussionReplyRow.tsx:917`), so the new callback is a stable
  `useCallback`.

**CC19 - `redraftRow(id)`** (group H, wave 0). In `useDiscussionReplies.ts`
beside `retryRow`: `setLogRetries(prev => [...prev, { at: new Date().
toISOString(), rowId: id }])` (the existing retry event shape,
`discussion-replies-log.ts:152-155`, so the `=== Retries ===` section and
the per-row `retried` column cover it with zero log-module change), then
`enqueueDrafts([id], draftDispatchForce("redraftRow"))`. **No `tableEpochRef`
bump** (that discards in-flight extraction merges, `:426,456`).
`"redraftRow"` joins `DraftDispatchSource` (`discussion-capture.ts:405-409`)
returning `true`, with its line at `discussion-capture.test.ts:341`. Declared
on `UseDiscussionRepliesReturn` (`discussion-draft-loop.ts:81-253`, beside
`retryRow` at `:226`), returned at `useDiscussionReplies.ts:834`, threaded
`DiscussionRepliesPanel.tsx:208/903` -> `DiscussionReplyTable.tsx:95/137/275`
(as `onRedraft`) -> `DiscussionReplyRow.tsx:160/225`.

**CC20 - The row control** (group D2). In the row's action cluster, after
Copy reply, a `Button variant="outlined" size="small"` labelled **"Redraft"**
(the table-level action is "Redraft every reply" and the hook is
`redraftRow`; one verb for one act, and it reads on a failed row where
"Regenerate" would not), `aria-label` "Redraft the reply to {name}", `title`
"Redraft". It REPLACES "Retry draft" and renders for every row that is not
`skipped`; while `row.state === "drafting"` it stays MOUNTED with `loading`
(CC6: a button is never removed while busy, and hiding it would shift the
reorder pair on every drafting row during a 30-row drain). It is never
disabled for a live capture (revision 3's premise was wrong: drafts dispatch
during capture). When `row.userEdited` is true OR `row.handledAt` is set (a
reply already copied out is one mis-click from diverging from what was
posted to Canvas) it is an arm/confirm (CC5, tone warning, idleVariant
outlined, consequence "This replaces the reply you edited." / "This replaces
a reply you already copied."); otherwise it fires on one click. The "Edited
by you" badge clears when the new draft lands.

**Tests:** `discussion-capture.test.ts` gains the `"redraftRow"` policy line;
a source-text assertion pins that `redraftRow` never touches `tableEpochRef`
and appends to `logRetries`; a row-level assertion pins that "Redraft"
renders with `loading` while drafting and not on a skipped row.

---

## 11. As built (2026-09-02): where the shipped code deliberately departs from the text above

Recorded after the verification wave (three Opus auditors), the four
follow-up passes, the accessibility pass and ten fixers. Each line here
overrides the criterion it names.

- **CC1 pressed toggles.** Mute and Teleprompter no longer take
  `variantFor(pressed)`: a pressed state in the primary fill was a third
  filled button on the stage. They are `variant="outlined"`, `aria-pressed`,
  stable label, plus `controls.pressed` (AM11's selected treatment:
  `--accent-soft` fill and a 2px inset accent ring).
- **CC1 per-state predicates.** Every `variantFor(true)` constant is gone;
  paused/annotating states in StagePanel and WalkthroughPanel resolve to one
  contained button, the announcement's five failure branches each carry one
  contained recovery action, grading's "rows but no rubric" state makes Add
  rubric the primary, the probe's Run button stays primary while it runs,
  Narrate's empty deck/video states make the Choose button primary, and the
  avatar stage derivation is readiness-based. The frozen per-file inventory
  in `ui/buttonVariant.test.ts` records the resulting counts with reasons.
- **CC1 discussions formula.** `primaryAction = capturing ? null :
  pendingEligible > 0 ? "draft" : null` - `drafting` is NOT in it (a single
  row's Redraft starts the drain); the Draft button carries `loading=
  {drafting}` in either variant and the reason line counts pending, failed
  and drafting rows, shown only while drafting and above zero.
- **CC2 Captions.** The legend is "Captions", the run row sits AFTER the
  fieldset, and a surface has ONE `.runRow`; Download .vtt and the export row
  are plain `.ghActions`. Speed's video block and captions' share the legend
  "Video". Module deck's slide-count hint renders inside the Deck section
  under the template picker through a `templateHint` prop while its literal
  stays in the panel file.
- **CC5.** `ConfirmArmButtons` gained `buttonRef` (merged with
  `useImperativeHandle`) so callers keep focus maps without querying the
  DOM. Delete take is ONE MenuItem whose label swaps, with a Cancel item and
  `disableRestoreFocus` on the Menu. The More-menu Remove's consequence
  lives INSIDE the Menu as the Confirm item's secondary text with
  `aria-describedby` on that item (a Menu is a modal; siblings are
  aria-hidden). Regenerate announcement keeps the component mounted in both
  the touched and untouched states.
- **CC6.** Speed keeps its run row mounted while re-encoding (label
  "Re-encoding…", Cancel beside it). Start camera keeps `disabled=
  {capturePreviewStarting}` beside `loading` (a test pin). A copy with no
  feedback refuses with a named reason instead of a false "Copied".
- **CC9.** Eight tabpanels, not nine (record and announcement share one);
  its `aria-labelledby` follows the selected tab.
- **CC10.** The recording key inventory measured 60 before widening, so it is
  62, not 61.
- **CC11 roles.** Discussions, grading AND module deck now use ONE polite
  `role="status"` wrapper around their notice list with no role on items;
  the earlier "grading and module deck keep per-notice alert" sentence is
  withdrawn on the accessibility pass's finding that a bad run queued N
  assertive interruptions. Grading's notices moved under the header.
- **CC13 additions.** `.stack` (vertical grouping; `.section` is the FIELDSET
  reset and appears only on fieldsets), `.itemCard` (list-item card; the
  three studios' per-item cards use it, `.ghPanel` is a panel), `.pressed`,
  `.rowActionsHeader`, `.statusRow` margin restored, and the hairline rule
  scoped to `fieldset.section + fieldset.section`.
- **CC14.** GradingTable's sort glyph takes `active` and dims like the
  discussion table's; grading rows restore focus after a removal through a
  keyed ref map; the copy success is announced through a hidden status.
- **CC15.** The upload label passes `role={undefined}` (ButtonBase does set
  `role="button"` on a non-button component) and carries `loading` while
  the file is read.
- **Line endings.** The index stores LF; an early normalisation to CRLF was
  reverted because eight source-text tests pin `\n`. Only `docs/REGRESSION.md`
  is stored unnormalised with CRLF.

Second fix wave (after the step-10 reviewer, researcher and group-scale
aesthetics reviewer):

- **CC10 hydration.** A `<details open>` whose `open` came from localStorage
  in the `useState` initialiser rendered closed on the server and React only
  WARNS on that mismatch (react-dom-client `hydrateBooleanAttribute`), so the
  persisted-open state never showed on reload. Both disclosures now
  initialise `false`, read the key in a mount effect (setState after an
  await, cancelled flag) and write only on the toggle event. The
  `localStorage.getItem("<key>")` call shape stays in the source for the key
  canary.
- **CC1 discussions, final.** Start/Stop capture is `variantFor(capturing ||
  (primaryAction === null && !drafting))`: during a bulk drain there is NO
  contained primary (the Draft button is outlined and spinning) rather than
  a lit Start capture. The toolbar prop is `draftingRemaining`.
- **CC1 Record.** The main-row primary is `variantFor(tool === "off" ||
  !hasStream)`; stopping a preview while an annotation tool is active no
  longer leaves the stage with no primary (a regression the first fix wave
  introduced and the whole-diff reviewer caught).
- **CC2 Announcement.** Three sibling sections - "Post to" (the course is a
  destination), "Announcement style", "Image" - not a nested pair; the Post
  row carries `.runRow`.
- **CC5.** TakesPanel's Menu keeps MUI's focus restore (dropping it broke
  Escape and click-away); only the delete path uses the keyed ref map.
- **CC12** now applies to Discussion replies too: its status column is
  outside the aria-hidden wrapper, matching the three siblings.
- **CC13 additions (second wave).** `.sliderBox`, `.previewVideoHidden`,
  `.playerAudio`, `.playerVideo`, `.listRow`, `.growMeta`, `.subLabel`;
  `.itemCard` now stacks its children by itself; `.pressed` sets
  `border-color: transparent` so an outlined button does not wear a 3px rim.
  Every class has a consumer; the orphan ratchet reads 137.
- **CC11 grading.** The three standalone danger paragraphs joined the single
  polite notices slot; non-danger kinds render as neutral `.notice` on both
  grading and module deck.
- **Narrate.** The cross-origin avatar link is labelled "Open video" (it
  opens in a new tab; a `download` attribute is ignored cross-origin).
- **Reviewer facts corrected in the text above:** ButtonBase DOES set
  `role="button"` on `component="label"` (hence `role={undefined}`);
  IconButton has no `loadingPosition`.
- **CC16 additions found by the regression pass:** `CaptionsList`'s
  shift-all seconds field commits on Enter (same gate as its button);
  `useDiscussionReplies.ts` still exports `retryRow`, now with no UI
  consumer (kept for the frozen return shape; deletable in a follow-up
  together with the `"retry"` dispatch source and the wiring-test anchors).
  The theme's warning palette and the strip's `flex-wrap` are app-wide and
  were authorised in section 4, not CC16: twelve other tab strips share
  `.lessonInnerTabs` and can now fold to a second row, and
  `repo-detail/PullsTab.tsx:238` is the one other `color="warning"` consumer.

## 9. Limits stated up front

vitest here is node-env and collects only `src/**/*.test.ts`. **No component
is rendered and no pixel is measured.** Every claim in this group about
height alignment, wrapping, focus reveal, uppercase leakage into MUI labels,
and what the nine-tab strip does at 1000px is a claim about source text.
The heights 30.75 / 28 / 37.7 / 38px are arithmetic over MUI's source, not
observation; sub-pixel rounding may make a Button 30 or 31. A flex
`<fieldset>` laying out identically in Chromium, Gecko and WebKit with its
legend excluded from `gap` is spec knowledge, not observed. `align-self:
stretch` centring a MUI Button's label is expected (the root is `inline-flex;
align-items: center`), unverified. White on `#92400e` at 7.1:1 is the WCAG
formula over hex. The `loading` prop's indicator has never been seen
spinning in this app, and whether `prefers-reduced-motion` freezes it to a
visible arc is a guess about where MUI's 0.01ms cutoff lands. The
`:has(:focus-visible)` ring on the upload label has never been observed
painting. The 3.25px step between the knowledge bulk bar and the panels it
launches is real on a shared edge, but nobody has looked.
