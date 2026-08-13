# One shared dismissal and focus behaviour for every modal dialog

Four gaps are universal across this app's modals: no Escape-to-close, no focus
trap or initial focus, no focus restoration to the opener, and dismissal that is
mouse-only. `docs/REGRESSION.md` entry 230 records the last of those as open
debt; entry 273 is the measured baseline this change is made against.

The count in the original report was eleven. It is **42 overlay dialogs in six
structurally distinct families, plus one that belongs to none**, and the
families decide the design - see entry 273 check 1. A fix shaped for one family
silently changes another.

(This line said "38" from the day it was written until wave C5. Entry 273 check
1 corrected 38 to 42 BEFORE the baseline was ever built against, and this
document went on citing the retracted figure - while pointing at the very entry
that retracted it - through four shipped waves. Two more counts below were wrong
the same way. Nobody re-reads a premise once the ACs beneath it look right.)

## Decisions taken up front

These were the open questions. Each is settled here so no implementer has to
guess, and each is settled toward the fuller fix rather than the cheaper one.

1. **Layered, not one wrapper.** A pure `modalFocus.ts`, a `useModalDismiss`
   hook built on it, and a `ModalShell` component built on the hook. Tier 1 and
   2 sites adopt the shell; Tier 3 and 4 sites take the hook only and keep their
   own markup. This is the layering `gridFocus.ts` and `confirmArming.ts`
   already establish in this repo.
2. **`ModalShell` renders exactly two elements: `.previewBackdrop` wrapping
   `.previewModal`. No extra DOM level, ever.** Entry 257 check 4 pins
   `--focus-ring-color` on `.previewModal` because `GradingResults`'s overlays
   render inline inside `LiveFeedPanel`'s navy pane; inserting a level or moving
   the class silently reverts the focus ring to an unreadable colour there.
3. **`role="dialog"` and `aria-modal` move onto the content element, and
   `ModalShell` takes a REQUIRED `label` prop.** That fixes the 12 family-A2
   dialogs that today put the role on a full-viewport backdrop and have no
   accessible name at all, and it makes a missing name a compile error rather
   than an omission.
4. **The trap is in scope**, with a containment predicate that treats a
   portalled MUI surface (`[role="listbox"]`, `[role="menu"]`,
   `.MuiPopover-root`, `.MuiModal-root`) as inside the modal. Without it the
   trap yanks focus back from an open `Select` listbox and closes it, breaking
   five modals that work today. MUI's own trap survives this only by
   registering with a shared `ModalManager`; building on
   `Unstable_TrapFocus` to inherit that was considered and rejected - an
   `Unstable_` API is not a foundation for 29 call sites, and the predicate is
   pure and testable where the manager is not.
5. **An open-modal stack, LIFO.** Only the topmost open modal traps focus and
   receives Escape. `OfficeEditorModal` mounts two overlays at once and
   `AccessibilityCenter` is the always-mounted parent of four more; without a
   stack, both have competing traps and no correct behaviour.
6. **Dismissal calls a component-supplied handler, never `onClose` directly.**
   `CommentEditModal` refuses to close while dirty and shows a discard
   confirmation instead; `GradableEditorModal` closes through its own
   `closeModal`. A shared Escape wired to `onClose` would throw away an
   instructor's unsaved edit. The handler is the policy; the hook never decides.
7. **Initial focus lands on the first tabbable control, not on a
   `tabIndex={-1}` container.** Entry 257 check 5 makes this a correctness
   question, not a preference: an element that IS what takes focus needs no
   ring reset, one that merely CONTAINS it does. A container that takes focus is
   on the wrong side of that rule. Where a modal has no tabbable control, the
   container is the documented fallback.
8. **"Not mouse-only" means Escape plus a keyboard-reachable Close control in
   every modal.** The backdrop stays decorative. Giving it `role="button"` and a
   tab stop would add a focusable element INSIDE an `aria-modal` region whose
   only purpose is to leave, and the `jsx-a11y` rules that would police it are
   off in this repo anyway (entry 273 check 10).
9. **Focus restoration uses a ref captured when the modal was opened, never
   `document.activeElement`.** Both reasons are already written down in this
   repo: React reconciliation can blur to `document.body` first, and Safari does
   not focus a button on click.

## Acceptance criteria

**AC1 - the pure module carries everything testable.** `modalFocus.ts` exports
at minimum: a key predicate mapping a plain `{key, shiftKey, defaultPrevented}`
object to `"close" | "trap-forward" | "trap-back" | null`; a tabbable-ordering
function over plain `{tabIndex, disabled, hidden, index}` descriptors; the
containment predicate from decision 4 over a plain ancestor-descriptor list; the
restore-target choice from decision 9; and the open-modal stack. No DOM, no
React, no MUI, no CSS-module import - `gridFocus.test.ts` asserts exactly that
purity of itself by reading its own source, and this module does the same.

**AC2 - Escape closes the topmost modal only.** A modal that is not top of the
stack ignores Escape. A key event whose `defaultPrevented` is already true is
ignored, so an inline editor that handled Escape first (several exist) is not
overridden. Legacy `"Esc"` is accepted alongside `"Escape"`.

**AC3 - focus is trapped, and portalled MUI popups stay reachable.** Tab and
Shift+Tab cycle within the topmost modal; focus never lands behind the backdrop.
An open MUI `Select` listbox, which lives at `document.body`, counts as inside.
At least SEVEN modals contain a portalling select and must remain fully
keyboard-operable: `BulkUploadModal`, `GradableEditorModal`, `SchedulerModal`,
`CourseCopyModal`, `GeneratedPreviewModal`, `inbox-panel.tsx`'s planner dialog
(its time-zone `TextField select`), and `BulkQuestionsModal` (via the
question-type select its `DraftQuizQuestions` child renders,
`DraftQuizQuestions.tsx:63`). This list said FIVE until wave C3 measured it, and
the last two were both already shipped and adopting by the time anyone counted -
so treat it as a floor, not a total. A select reached through a CHILD component
is what both omissions had in common; grepping a modal's own source for
`TextField select` will keep undercounting.

Focus must also not be able to land behind the backdrop by the INDIRECT route
wave C3 found: when the focused control unmounts while the dialog is still open
(`CourseCopyModal`'s phase changes do exactly this) the browser resets focus to
`<body>` and fires no `focusin`, so the safety net never runs and the next Tab
is a native one out of the dialog. "Focus is not a descendant of the container"
therefore has to be split into "focus is in a portalled popup" (leave Tab alone)
and "focus is adrift" (recapture it), not treated as one case.

**AC4 - initial focus and restoration.** On open, focus moves to the first
tabbable control per decision 7. On close, focus returns to the opener captured
per decision 9. A modal whose opener has since unmounted must not throw and must
not leave focus on `<body>`.

**AC5 - every adopting modal keeps its own close semantics.** Per decision 6.
`CommentEditModal`'s dirty guard and `GradableEditorModal`'s `closeModal` must
behave exactly as they do today; adopting the mechanism adds Escape and focus
handling and changes nothing about when the modal actually closes.

**AC6 - the ARIA tree improves and nothing regresses.** Every adopting modal
ends with `role="dialog"` and `aria-modal="true"` on its content element and a
non-empty accessible name. The 13 family-A1 sites keep the names they have; the
13 family-A2 sites gain names they never had. (This said "14" and "12" until
wave C5; entry 273 check 1 measured 13 and 13.)

**AC7 - the exclusions are explicit, not omissions.** Family D (the three
floating windows) is non-modal by a recorded decision and must NOT gain a trap
or Escape. Family E (SEVEN MUI `Dialog`s - `TextbookPhotoModal`, `TasksTab`,
`RecommendTextbooksModal`, `CoursesTable`, `ManageTasksDialog`,
`TaskAttachmentsDialog`, `FolderActionsMenu`; this AC said "four" until wave
C3's guard test counted them against entry 273 check 1) already has all of this
and must not get a second mechanism fighting `ModalManager`. The two wave-2
REFUSALS - `LecturePlanPreviewModal` and `lesson-plan/index.tsx`, which use a
different content class (`.lessonPreviewModal`) and would have been silently
resized by adoption (commit f16c7aa) - are NOT permanent exclusions and must not
be filed as though they were: REGRESSION entry 279 check 2 records that refusal
as provisional, pending a decision on whether that class should survive at all.
They get their own DEFERRED list in the guard test, on the same two-directional
terms as the pending one. `TaskCell`'s Popper keeps its
own Escape and its roving-tabindex restore for reasons entry 230-era work
records. Each exclusion is listed in the guard test as a named allowlist entry,
so removing one is a visible decision.

**AC8 - a derived inventory guard.** A wiring test scans source for every
`styles.previewBackdrop` and every `role="dialog"` site and asserts each one
either adopts the mechanism or appears in AC7's allowlist. It must derive its
file list from the tree, never hardcode it: a hardcoded list already failed an
audit on this exact surface by excluding the file it was meant to police (entry
272 check 5). This test is the only available gate - lint cannot see any of this.

**AC9 - the focus ring survives.** `src/app/focusRing.wiring.test.ts` stays
green, and entry 257 check 4's `.previewModal` reset still applies to every
adopting modal. Verify against `GradingResults` inside `LiveFeedPanel`
specifically, which is the case that reset exists for.

**AC10 - the usual gates.** Suite green, `tsc` clean, `lint` clean, no emojis,
every touched file under 1000 lines, no new dependency.

## Waves

Adoption is 30 dialogs across 27 files and does not land in one change. (Planned
as "29 sites across 26 files"; the plan never counted `GradingResults`'s SECOND
overlay. The end state, derived from the tree rather than from this document:
24 dialogs via `ModalShell`, 6 via the hook directly.)

- **C1** - the three new files (`modalFocus.ts`, `useModalDismiss.ts`,
  `ModalShell.tsx`) plus their tests. Touches no existing component.
- **C2** - Tier 1: the 11 purely mechanical family-A1 sites.
- **C3** - Tier 2: the 9 family-A2 sites, which also gain accessible names.
- **C4** - Tier 3: the 5 inline-styled overlays, hook only.
- **C5** - Tier 4, one at a time, each with its own reasoning:
  `OfficeEditorModal` (two simultaneous overlays), `AccessibilityCenter` (always
  mounted, parent of four), `GradingResults` (nested inside a navy pane,
  focus-ring dependency), `CommentEditModal` (dirty guard),
  `AttachmentPreviewModal` (already has Escape and initial focus; adopting means
  removing two working effects and reversing a written decision).

Each wave is independently verifiable and independently pushable. C5's sites are
where a shared mechanism would CHANGE behaviour rather than add to it, so none of
them rides along with a bulk wave.

## C3 implementation notes - the vetted reuse survey

Read before touching a C3 file. Everything below already exists; none of it is
to be re-derived or re-invented.

- `src/app/components/ui/ModalShell.tsx` - the shell. Renders `.previewBackdrop`
  wrapping a `<section className={styles.previewModal}>` carrying
  `role="dialog"`, `aria-modal="true"`, `aria-label={label}`, `tabIndex={-1}`
  and the hook's `containerRef`. Props: `label` (required), `onDismiss`,
  `restoreFocusRef`, `contentStyle`, `contentClassName`.
- `src/app/components/ui/useModalDismiss.ts` - the hook, for sites that keep
  their own markup (C4/C5, not C3).
- `src/app/components/ui/modalFocus.ts` - the pure decisions, already tested.
- **The wave-2 precedent for width.** Every C3 site carries an inline
  `style={{ width: "min(NNNpx, 95vw)", maxWidth: "none" }}` on its
  `.previewModal` div. `ModalShell`'s default is 980px, so that style MUST move
  to `contentStyle` verbatim - dropping it is the exact bug wave 2 had to fix
  in `BulkQuestionsModal` and `AssignmentPreviewModal` (see commit f16c7aa).
- **The wave-2 precedent for refusal.** `LecturePlanPreviewModal` and
  `lesson-plan/index.tsx` were refused because they use a DIFFERENT content
  class. Confirm each C3 file really uses `styles.previewModal`; all nine do,
  but confirm rather than assume.
- `styles.previewHeader` / `styles.previewCloseButton` - the existing header
  and Close control. Every C3 site already has a keyboard-reachable Close, so
  AC8's "not mouse-only" half needs no new control anywhere in this wave.

**C3's nine files, ten dialogs** (`inbox-panel.tsx` contributes two), all family
A2 - `role`/`aria-modal` on the BACKDROP, no accessible name at all today
(REGRESSION entry 273 check 1). Each gains one:

| site | accessible name | dismissal handler |
| --- | --- | --- |
| `BulkCreateModulesModal.tsx:113` | `Create modules` | `onClose` |
| `RenameModulesModal.tsx:61` | `Rename modules` | `onClose` |
| `PageEditorModal.tsx:125` | the `isNew` ternary, same string as the `h3` | `onClose` |
| `BulkUploadModal.tsx:71` | `Bulk upload & match to modules` | `onClose` |
| `SchedulerModal.tsx:114` | `Schedule due dates` | `onClose` |
| `RubricBuilderModal.tsx:200` | the `editing` ternary, same string as the `h3` | `onClose` |
| `CourseCopyModal.tsx:343` | the three-way ternary, same string as the `h3` | `onClose` |
| `GradableEditorModal.tsx:175` | `Edit ${kind.toLowerCase()}` | **`closeModal`, not `onClose`** |
| `inbox-panel.tsx:575` | the `studentName` ternary, same string as the `h3` | `() => setPlannerOpen(false)` |
| `inbox-panel.tsx:697` | `Your calendar` | `() => setShowCalendar(false)` |

Where the `h3` is a ternary the label repeats the same expression rather than a
new invented string, so the visible heading and the accessible name cannot
drift apart.

`GradableEditorModal` is decision 6 in the flesh: its backdrop already routes
through `closeModal`, which calls `onSaved()` first when quiz questions changed.
Escape must reach `closeModal` too, never `onClose`.

`inbox-panel`'s two dialogs can be open SIMULTANEOUSLY - the planner's "Open
full calendar" button sets `showCalendar` while `plannerOpen` stays true, and
they render as siblings, not nested. This is the first live exercise of
decision 5's LIFO stack outside `OfficeEditorModal`: the calendar mounts second,
registers second, and is therefore topmost, so Escape closes the calendar and
leaves the planner open. That is the correct behaviour and it is what the stack
exists for.

Five C3 sites contain a portalling MUI `select` (`BulkUploadModal`,
`SchedulerModal`, `CourseCopyModal`, `GradableEditorModal`, and the time-zone
`<TextField select>` in `inbox-panel.tsx`'s planner dialog, around lines
610-624), so this wave is the first real exercise of decision 4's containment
predicate. Nothing in the suite can prove it; it is verified by reading, per
Limits below.

**The AC8 guard lands with this wave, in its pending-list form.** The test
derives its file list from the tree and asserts every dialog site either adopts
the mechanism, or appears in one of two named lists: the permanent AC7
exclusions, or a PENDING list naming the C4/C5 sites and the wave that will take
them. The pending list is empty by the end of C5. A hardcoded file list is
forbidden - one already failed an audit on this exact surface by excluding the
file it was meant to police (entry 272 check 5).

## C4 implementation notes - the vetted reuse survey

Read before touching a C4 file. C4 takes the HOOK, not the shell: these five
overlays have no CSS module at all - they are hand-rolled inline
`position: fixed` surfaces (family B, REGRESSION entry 273 check 1) - and
`ModalShell` hardcodes `.previewBackdrop`/`.previewModal`, so adopting it would
restyle every one of them. Wave 2 refused two sites for exactly that reason
(entry 279 check 2); do not repeat it one tier down.

**The five sites are structurally IDENTICAL**, which is why they batch. Each is
a fixed `inset: 0` backdrop at `zIndex: 10001` carrying `onClick`, `role="dialog"`,
`aria-modal="true"` and an `aria-label`, wrapping a content `div` that carries
only `onClick={(e) => e.stopPropagation()}` and an inline
`width/maxHeight/background/borderRadius/display/flexDirection/boxShadow`.

| site | content width | accessible name (already present) | dismissal handler |
| --- | --- | --- | --- |
| `DocStructureEditor.tsx:142` | `min(680px, 96vw)` | `Fix document structure` | `() => onClose()` |
| `PdfFixEditor.tsx:90` | `min(560px, 96vw)` | `Fix PDF accessibility` | `() => onClose()` |
| `OfficeAltEditor.tsx:127` | `min(640px, 96vw)` | `Edit image alt text` | `() => onClose()` |
| `RemediationEditor.tsx:105` | `min(720px, 96vw)` | `Fix accessibility issue` | `() => onClose(false)` |
| `OfficeEditorModal.tsx:275` (nested) | `min(440px, 96vw)` | `Move section to another file` | `() => setMovingSection(null)` |

**Unlike C3's sites these already HAVE accessible names** - all five. So AC6's
job here is only to move `role`/`aria-modal`/`aria-label` from the backdrop onto
the content element (decision 3). The name string itself does not change, and no
site invents one.

**Four things `ModalShell` was doing for free that a hook-only adopter must do
by hand:**

1. `tabIndex={-1}` on the content element. Without it, decision 7's documented
   fallback is a silent no-op - `.focus()` on a non-focusable element does
   nothing and focus is left on `<body>` (see `focusFirstTabbable`'s own doc
   comment).
2. `ref={containerRef}` on the content element - the SAME node that carries
   `role="dialog"`. The trap and the initial-focus search both scope to it.
3. `useModalDismiss<HTMLDivElement>({ open: true, onDismiss })`. The type
   parameter is required on a plain `<div>`: a `RefObject`'s `current` is a
   mutable, therefore invariant, property, so the default
   `RefObject<HTMLElement | null>` will not assign to a `<div>`'s
   `Ref<HTMLDivElement>`. The parameter exists so no call site needs a cast.
4. The right `open` value, which is NOT the same at all five sites. **The rule:
   derive `open` from whatever gates the overlay's own render; hardcode `true`
   only when the component is mounted SOLELY while its overlay is visible.**
   - The four editors take `open: true`. Each is mounted only while its overlay
     shows: `DocStructureEditor` via `{structureFile && ...}` in `FilesView`,
     and all four as branches of one ternary chain in `AccessibilityCenter`,
     which additionally unmounts the whole subtree via its own
     `if (!render) return null`.
   - `OfficeEditorModal`'s nested overlay takes
     `open: movingSection !== null`, because that component stays mounted for
     its OUTER dialog's entire lifetime. A hardcoded `true` there would
     register a phantom entry in the shared stack on every render where the
     overlay is not on screen, permanently stealing "topmost" from the outer
     dialog once C5 adopts it. `movingSection` is typed `T | null`, so the
     predicate is exactly co-extensive with the `{movingSection && ...}` render
     guard - had it been `T | undefined`, the same expression would have been a
     permanent phantom.

   **`AccessibilityCenter`'s children are NOT "always mounted"**, and three
   places in this repo said they were (this document, `useModalDismiss.ts` and
   `ModalShell.tsx`, all now corrected). That was a misreading of REGRESSION
   entry 273 check 7, which says the PARENT is mounted always. The four
   children are a ternary chain that unmounts with it. This matters for C5,
   where the parent IS the hard case: `render` stays true for the full 320ms
   slide-out, and `close` does not clear `fixTarget`, so `open` there must come
   from `shown`/`centerOpen`, never a hardcoded `true`.

**`OfficeEditorModal`'s OUTER dialog stays unadopted** until C5 - only the
nested `movingSection` overlay converts. That is safe and deliberate: the stack
only knows about modals that registered, so with only the nested one registered
it is trivially topmost, Escape closes it, and the outer dialog keeps exactly
the behaviour it has today. The two are SIBLINGS in a fragment, not DOM-nested.

**No site has an Escape handler to conflict with.** All four editors carry an
inner `onKeyDown` (via MUI `slotProps.input`), and every one of them tests only
`Enter` - so none sets `defaultPrevented` on Escape and AC2's guard is never
falsely tripped. Verified by reading all four; entry 273 check 3 warns against
re-running the grep that got this wrong.

**Nothing about these sites touches `.previewModal`**, so entry 257 check 4's
focus-ring reset is not in play for C4 - but that also means these five have no
`--focus-ring-color` reset of their own, on a surface painting
`var(--field-background)`. That is pre-existing and out of scope; record it,
do not fix it here.

## C5 implementation notes - the vetted reuse survey

These five are where a shared mechanism would CHANGE behaviour rather than add
to it. Each is reasoned separately below; none is mechanical.

**`GradingResults` (two overlays) - shell, and the focus-ring case.** Already
family A1: `.previewBackdrop` wrapping `section.previewModal` with `role`,
`aria-modal` and a name. Adoption is structurally a no-op - which is the whole
point, because entry 257 check 4 pins `--focus-ring-color` on `.previewModal`
precisely because these two render INLINE (no portal) inside `LiveFeedPanel`'s
navy `.lfDetail`. `ModalShell` renders exactly that shape with nothing between,
so the inheritance chain survives; verify it rather than assume it. Dismissal is
`setExpandedStudent(null)` and `setCodeOutputStudent(null)`. Both can be open at
once only if the code path allows it - check.

**`CommentEditModal` - shell, and decision 6 in its purest form.** Already
family A1 with a name. `handleClose` refuses to close while dirty and shows an
inline discard confirmation instead; `handleBackdropClick` IS `handleClose`. So
`onDismiss={handleClose}` and the guard runs on Escape exactly as on a backdrop
click. Wiring Escape to `onClose` would throw away an instructor's unsaved
comment - the failure decision 6 exists to prevent. Note the second Escape:
once `discardConfirm` is set, a second Escape closes for real, which is the
standard two-step and worth stating rather than discovering.

**`AccessibilityCenter` - hook only, and the highest phantom risk in the
project.** A `position: fixed` `<aside>` plus a separate `aria-hidden` backdrop;
no CSS module, so the shell is wrong for it. Three traps:
1. `if (!render) return null` sits at line 132 - the hook call must be ABOVE it,
   like every other hook.
2. `render` stays true for the full `TRANSITION_MS` slide-out, so `open` must
   derive from `shown`/`centerOpen`, NEVER a hardcoded `true`, or an off-screen
   panel stays registered and topmost through the exit animation.
3. `close` does NOT clear `fixTarget`. Closing the panel while an editor is open
   leaves `fixTarget` set, so the next open mounts the panel AND a child editor
   in the SAME commit - and React runs child effects before parent effects, so
   the child registers first and the PARENT lands on top. Escape would then
   dismiss the panel with an editor still on screen. This is recorded in
   REGRESSION 281 as a warning; C5 is where it becomes live.

**`AttachmentPreviewModal` - the recorded decision against a trap no longer
holds.** It already has Escape and initial focus, and a comment refusing a trap
on the stated grounds that "FilePreviewModal/CsvPreviewModal/etc. never trapped
focus either". **Waves 2 to 4 made that premise false** - all of those now trap.
So adopting is not reversing a considered decision; it is following the decision
to where its own reasoning now points. Adopting replaces two working effects,
so the replacement must be strictly better, not merely shared.

It is also **the one site where focus restoration can finally ship**: AC4's
second half is undelivered across all eighteen adopters because no opener
captures a ref - but `AttachmentsPanel` already keeps `previewTriggerRef`
(`event.currentTarget` at click time), the exact precedent decision 9 cites.
Either pass it as `restoreFocusRef` and remove the panel's own restore, or
leave the panel's and pass nothing - but do NOT end with both, and say which and
why.

**`OfficeEditorModal`'s OUTER dialog - shell, with a live sibling.** Its nested
overlay already adopted in C4 with `open: movingSection !== null`. The outer one
is the last family-A2 site and the last `PARTIALLY_ADOPTED` entry. Both are
mounted at once whenever a section is being moved, as SIBLINGS in one fragment.
The outer registers first (it mounts first), so the nested one is topmost while
open and Escape closes the nested overlay first - verify that ordering survives
rather than assuming it, since this is the case decision 5 was written for.

## Limits

vitest is node-env and renders no component, so nothing here proves a real Tab
order, that a portalled listbox is truly reachable, that Escape reaches
`document` before an inner handler stops it, or that focus visibly moves. AC1's
pure module is the only part under real test; everything else is verified by
reading, and the AC8 guard proves only adoption, not behaviour. The app cannot
be run here (no Supabase env), so this change ships unobserved in a browser -
state that plainly in the regression entry rather than implying otherwise.
