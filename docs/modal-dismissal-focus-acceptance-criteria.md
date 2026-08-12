# One shared dismissal and focus behaviour for every modal dialog

Four gaps are universal across this app's modals: no Escape-to-close, no focus
trap or initial focus, no focus restoration to the opener, and dismissal that is
mouse-only. `docs/REGRESSION.md` entry 230 records the last of those as open
debt; entry 273 is the measured baseline this change is made against.

The count in the original report was eleven. It is **38 overlay dialogs in six
structurally distinct families**, and the families decide the design - see entry
273 check 1. A fix shaped for one family silently changes another.

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
The five modals containing a portalling select
(`BulkUploadModal`, `GradableEditorModal`, `SchedulerModal`, `CourseCopyModal`,
`GeneratedPreviewModal`) must remain fully keyboard-operable.

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
non-empty accessible name. The 14 family-A1 sites keep the names they have; the
12 family-A2 sites gain names they never had.

**AC7 - the exclusions are explicit, not omissions.** Family D (the three
floating windows) is non-modal by a recorded decision and must NOT gain a trap
or Escape. Family E (four MUI `Dialog`s) already has all of this and must not
get a second mechanism fighting `ModalManager`. `TaskCell`'s Popper keeps its
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

Adoption is 29 sites across 26 files and does not land in one change.

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

## Limits

vitest is node-env and renders no component, so nothing here proves a real Tab
order, that a portalled listbox is truly reachable, that Escape reaches
`document` before an inner handler stops it, or that focus visibly moves. AC1's
pure module is the only part under real test; everything else is verified by
reading, and the AC8 guard proves only adoption, not behaviour. The app cannot
be run here (no Supabase env), so this change ships unobserved in a browser -
state that plainly in the regression entry rather than implying otherwise.
