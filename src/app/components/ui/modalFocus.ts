// The pure core of the shared modal dismissal/focus mechanism -
// docs/modal-dismissal-focus-acceptance-criteria.md. Every DECISION the
// mechanism makes lives here, as a plain function over plain data: what a
// keypress means, what order tabbable elements go in, what counts as
// "inside" the dialog, which candidate wins focus restoration, and which
// modal in an open stack is allowed to react at all. useModalDismiss.ts is
// the DOM wiring around these decisions - the keydown listener, the
// querySelector call, the actual .focus() call - none of which this file
// touches, mirroring the split gridFocus.ts/TasksGrid.tsx and
// confirmArming.ts/their callers already establish in this repo.
//
// PURE means exactly that: no DOM, no React, no MUI, no CSS-module import.
// This module must be importable from a plain node test with nothing else
// pulled in - modalFocus.test.ts's own closing describe block asserts that
// of THIS file's source text the same way gridFocus.test.ts:134-140 asserts
// it of gridFocus.ts, because vitest transforms .tsx and MUI imports quite
// happily under environment "node" and only RENDERING fails - a source-text
// scan is the only thing that can catch an import that would compile clean
// here and break the purity contract anyway.
//
// Nothing in this file mutates any argument it is given, and every function
// is deterministic - no Date.now, no Math.random, no reference to `window`
// or `document`.

// -----------------------------------------------------------------------
// modalKeyAction (AC2, AC3) - what a keypress means, independent of who is
// listening for it or what is currently focused.

export interface ModalKeyEvent {
  readonly key: string;
  readonly shiftKey?: boolean;
  /** Mirrors KeyboardEvent.defaultPrevented. Several inline editors in this
   * app already handle Escape themselves and call preventDefault - a shared
   * handler that ignored that would cancel the edit AND close the dialog on
   * one press (AC2). */
  readonly defaultPrevented?: boolean;
}

export type ModalKeyActionResult = "close" | "trap-forward" | "trap-back" | null;

/**
 * Maps a keydown to what the shared mechanism should do about it, or `null`
 * for "nothing to say" - which covers both an ordinary key (Enter, a letter,
 * an arrow) and a key some other handler already claimed. Checked FIRST and
 * unconditionally: `defaultPrevented` overrides everything else, so an
 * already-handled Tab is as thoroughly ignored as an already-handled
 * Escape.
 */
export function modalKeyAction(event: ModalKeyEvent): ModalKeyActionResult {
  if (event.defaultPrevented) return null;
  // "Esc" is what older browsers (and some still-shipping keyboard layouts)
  // report; accepting both costs nothing and a modal that only recognised
  // "Escape" would silently fail to close for exactly those users.
  if (event.key === "Escape" || event.key === "Esc") return "close";
  if (event.key === "Tab") return event.shiftKey ? "trap-back" : "trap-forward";
  return null;
}

// -----------------------------------------------------------------------
// orderTabbables (AC1, AC3, AC4) - the tab order among a dialog's tabbable
// descendants, and the initial-focus target (its first element) as a
// side effect of the same ordering.

export interface TabbableDescriptor {
  /** Position among the candidates as found in DOCUMENT order - the caller's
   * own querySelectorAll index, never recomputed here. This is what the
   * returned array's entries actually ARE: indices back into the caller's
   * own element list, not descriptors themselves. */
  readonly index: number;
  readonly tabIndex: number;
  readonly disabled: boolean;
  readonly hidden: boolean;
}

/**
 * The subset of `descriptors` that can actually take focus, in the order Tab
 * visits them: every element with a positive `tabIndex` first (ascending,
 * ties broken by document order - the rule browsers actually implement, and
 * the one hand-rolled traps most often get backwards), then every ordinary
 * (`tabIndex` 0 or negative-but-not-excluded... see below) element in plain
 * document order. `disabled`, `hidden`, and `tabIndex === -1` all exclude an
 * element outright - none of them can be "reached out of order", only
 * skipped.
 *
 * Returns indices into whatever list the caller built `descriptors` from,
 * not the descriptors themselves - the caller already has the real
 * elements; this only decides the order and the cut.
 *
 * Never mutates `descriptors`, and returns `[]` (never throws) for a dialog
 * with no tabbable control at all - a real case (a preview modal whose only
 * control is its Close button, hidden while a save is in flight). The
 * caller falls back to the container itself.
 */
export function orderTabbables(descriptors: readonly TabbableDescriptor[]): number[] {
  const focusable = descriptors.filter((d) => !d.disabled && !d.hidden && d.tabIndex !== -1);
  const positive = focusable.filter((d) => d.tabIndex > 0).sort((a, b) => a.tabIndex - b.tabIndex || a.index - b.index);
  const natural = focusable.filter((d) => d.tabIndex <= 0).sort((a, b) => a.index - b.index);
  return [...positive, ...natural].map((d) => d.index);
}

// -----------------------------------------------------------------------
// isInsideModalOrItsPopup (AC3, decision 4) - the containment predicate the
// trap and its focusin safety net both consult before ever pulling focus
// back. THE reason this predicate exists at all: every MUI Select in this
// app portals its open listbox out to document.body, so a trap that only
// knew about the dialog's own DOM subtree would see focus "escape" the
// instant a Select opens, yank it back, and close the dropdown - breaking
// five modals (BulkUploadModal, GradableEditorModal, SchedulerModal,
// CourseCopyModal, GeneratedPreviewModal) that work today.

export interface ModalAncestorDescriptor {
  /** True for the dialog's own content element - the one useModalDismiss
   * scopes the trap to. At most one entry in a chain should carry this. */
  readonly isModalRoot?: boolean;
  readonly role?: string;
  /** This element's own class list (not its ancestors') - checked against a
   * short, EXACT allowlist below, never a substring match, so an unrelated
   * MUI class cannot smuggle an element through. */
  readonly classNames?: readonly string[];
}

/** Roles a portalled MUI popup's own root can carry. Narrow on purpose - see
 * the module comment above and the "does not accept any element merely
 * because it carries some MUI class" test this guards. */
const PORTAL_POPUP_ROLES = new Set(["listbox", "menu"]);

/** Class names MUI itself puts on a portal's outermost node
 * (`Popover`/`Modal`'s own root), checked for an EXACT match against one
 * entry of the element's class list - never `.includes()` against the whole
 * className string, which would also match e.g. `MuiPopover-rootSomething`
 * or a class that merely contains the substring. */
const PORTAL_POPUP_CLASSES = new Set(["MuiPopover-root", "MuiModal-root"]);

/**
 * True when `chain` - the focused element's ancestors, NEAREST FIRST,
 * ending wherever the caller chose to stop walking up - reaches either the
 * dialog's own root or a portalled MUI popup's root. False for an empty
 * chain (nothing is focused, or the caller could not resolve one) and for
 * any chain that reaches neither, which is focus that has genuinely
 * escaped behind the backdrop.
 */
export function isInsideModalOrItsPopup(chain: readonly ModalAncestorDescriptor[]): boolean {
  return chain.some(
    (ancestor) =>
      ancestor.isModalRoot === true ||
      (ancestor.role !== undefined && PORTAL_POPUP_ROLES.has(ancestor.role)) ||
      (ancestor.classNames ?? []).some((className) => PORTAL_POPUP_CLASSES.has(className))
  );
}

// -----------------------------------------------------------------------
// canReceiveFocus (focus-restoration AC, finding 12) - whether a captured
// restore candidate can actually take focus, not merely whether it is still
// in the document. `useModalDismiss.ts` computes `RestoreCandidate.connected`
// from this rather than from `node.isConnected` alone, so every one of the
// 14 wired sites gets the fix with no call-site change.
//
// A disabled element is CONNECTED - `isConnected` says nothing about it -
// and `.focus()` on it is a silent no-op, so a caller that only checked
// `isConnected` would hand `restoreTarget` a candidate that "passes" and
// then does nothing, landing focus on <body> and looking exactly like
// success. FilesView.tsx's "Copy from another course" button
// (`disabled={!courseId}`) is the traced case: `courseId` can go null while
// its modal is still open.
//
// Deliberately does NOT check `display`/`visibility`/layout - those need a
// real layout pass and this runs inside a cleanup, possibly after the node
// has already been detached from a live document, where computed styles are
// unreliable or unavailable. `disabled` and `[inert]` are both attribute-
// level facts, readable with no layout at all.
//
// Deliberately does NOT treat `aria-disabled` as blocking, unlike
// `descriptorFor`'s own `disabled` computation in useModalDismiss.ts (which
// feeds the TAB ORDER, a different decision). An `aria-disabled` element
// remains genuinely focusable per the ARIA spec - only its interaction is
// suppressed - so treating it as unusable here would change currently
// correct behaviour: a caller that captured an `aria-disabled` opener could
// still restore focus to it today, and should keep being able to.
export interface FocusCandidateNode {
  readonly isConnected: boolean;
  /** The `disabled` IDL property, which only form controls (button, input,
   * select, textarea, fieldset) carry - never the `aria-disabled`
   * attribute; see the module comment above for why the two are treated
   * differently here. */
  readonly disabled?: boolean;
  /** `Element.closest` - used to ask whether this node sits inside an
   * `[inert]` subtree (an inert element and everything under it is
   * unfocusable per the HTML spec). `Element` here is a TYPE reference only
   * (erased at compile time, part of the ambient DOM lib) - it costs this
   * module no runtime import, so the "no DOM" purity guarantee this file's
   * own header comment describes still holds. Optional so a plain data
   * object without a real DOM node behind it (as in this file's own tests)
   * can still satisfy the type. */
  readonly closest?: (selector: string) => Element | null;
}

/**
 * True only when `node` is attached to the document, is not `disabled`, and
 * is not inside an `[inert]` subtree - the three ways a candidate can look
 * usable (`isConnected` alone says yes) while `.focus()` on it is actually a
 * silent no-op.
 */
export function canReceiveFocus(node: FocusCandidateNode): boolean {
  if (!node.isConnected) return false;
  if (node.disabled) return false;
  if (node.closest && node.closest("[inert]") !== null) return false;
  return true;
}

// -----------------------------------------------------------------------
// restoreTarget (AC4, decision 9) - which captured candidate focus actually
// returns to when the dialog closes.

export interface RestoreCandidate<T> {
  readonly value: T;
  /** Whether `value` is both attached to the document AND able to take
   * focus RIGHT NOW - the caller computes this (typically
   * `canReceiveFocus(node)` below, not merely `node.isConnected`), because
   * only the caller has a real DOM node to ask. React reconciliation can
   * unmount the opener while the dialog is still open; restoring focus to a
   * detached node is a silent no-op. A node can just as easily be attached
   * and still unable to take focus - a button that went `disabled` while
   * the dialog was open is connected but `.focus()` on it is ALSO a silent
   * no-op - so `isConnected` alone is not a sufficient computation for this
   * field, even though it looks like one. Either failure leaves focus
   * wherever the browser's default landed it (usually <body>), which is
   * worse than never trying. */
  readonly connected: boolean;
}

/**
 * The first candidate that is still connected, in the order given, or
 * `null` when none survive - deliberately NOT a detached node and NOT some
 * synthesized fallback like `document.body`: a caller that wants a
 * fallback passes it as a later candidate in the same array, and a caller
 * with nothing meaningful to fall back to gets an honest `null` to decide
 * what (if anything) to do with, rather than this function inventing an
 * answer.
 */
export function restoreTarget<T>(candidates: readonly RestoreCandidate<T>[]): T | null {
  for (const candidate of candidates) {
    if (candidate.connected) return candidate.value;
  }
  return null;
}

// -----------------------------------------------------------------------
// createModalStack (AC2, AC3, decision 5) - LIFO tracking of which modals
// are open, so only the topmost one traps focus or reacts to Escape.
// OfficeEditorModal mounts two overlays in one fragment and
// AccessibilityCenter is the always-mounted parent of four more; without
// this, every one of them would trap and react at once.

export interface ModalStack {
  open(id: string): void;
  close(id: string): void;
  isTopmost(id: string): boolean;
}

/**
 * A fresh, independent LIFO stack of open modal ids. useModalDismiss.ts
 * keeps exactly ONE instance of this at module scope, shared by every modal
 * anywhere in the app - that sharing is what makes "topmost" a meaningful,
 * cross-component fact rather than a per-component guess. This factory
 * stays a plain export (rather than a singleton baked in here) so its own
 * tests, and any future caller that genuinely needs an isolated stack, can
 * each get one that does not leak into another's state.
 */
export function createModalStack(): ModalStack {
  // A given id can appear at most once - `open` is a no-op for an id
  // already present, which is what keeps a React Strict Mode double-invoked
  // effect (mount, cleanup, mount again) from leaving a ghost second entry
  // that would permanently strand the real one behind it.
  const ids: string[] = [];

  return {
    open(id: string): void {
      if (ids.includes(id)) return;
      ids.push(id);
    },
    close(id: string): void {
      const at = ids.indexOf(id);
      if (at === -1) return;
      ids.splice(at, 1);
    },
    isTopmost(id: string): boolean {
      return ids.length > 0 && ids[ids.length - 1] === id;
    },
  };
}
