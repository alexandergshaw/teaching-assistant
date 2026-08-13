"use client";

// The React-facing half of the shared modal dismissal/focus mechanism -
// docs/modal-dismissal-focus-acceptance-criteria.md. modalFocus.ts carries
// every DECISION (what a keypress means, what order tabbables go in, what
// counts as "inside" the dialog, which restore candidate wins, which modal
// in the stack is allowed to act); this file is the DOM wiring around those
// decisions - a keydown listener, a focusin safety net, the initial-focus
// call, and the restore-on-close call. None of that is verifiable by this
// repo's vitest suite (node environment, no component ever renders - see
// modalFocus.test.ts's own header), so it is verified by reading, per the
// AC's own "Limits" section.
//
// ONE MODULE-SCOPED STACK. Every call to this hook, from every modal
// component anywhere in the tree, registers into the SAME modalStack
// instance below - that sharing is the only way "only the topmost modal
// traps" can mean anything across independent components rather than a
// per-component guess. This is why createModalStack stays a plain factory
// in modalFocus.ts (so ITS OWN tests can create isolated instances) while
// this file creates exactly one and never a second.
//
// EFFECT ORDER IS DELIBERATE. All five effects below share `open` as a
// dependency and therefore run together, in declaration order, whenever a
// modal opens: registration, then initial focus, then the restoration
// cleanup registers (but does nothing yet), then the keydown listener
// attaches, then the focusin safety net attaches. Initial focus firing
// BEFORE the focusin listener exists is what stops the mechanism's own
// opening focus() call from immediately re-triggering its own safety net -
// reordering these would not break anything it currently guards against,
// but it would waste a redirect on every single open.
import { useEffect, useId, useRef, type RefObject } from "react";
import {
  createModalStack,
  isInsideModalOrItsPopup,
  modalKeyAction,
  orderTabbables,
  restoreTarget,
  type ModalAncestorDescriptor,
  type RestoreCandidate,
  type TabbableDescriptor,
} from "./modalFocus";

const modalStack = createModalStack();

// Deliberately broad: this selects every CANDIDATE element, and
// orderTabbables (the pure module) is what actually decides inclusion from
// tabIndex/disabled/hidden. Narrowing the selector itself (e.g.
// `:not([disabled])`) would duplicate that decision in two places that
// could drift apart - one in this file, one in the pure module dedicated to
// exactly this kind of decision.
//
// `iframe` and `summary` are here because both are natively tabbable, and
// omitting them made this mechanism regress content that was
// keyboard-reachable before it existed - because the trap preventDefault()s
// every Tab while focus is inside the container and moves focus itself, an
// omitted-but-tabbable element becomes unreachable, not merely
// deprioritised. Confirmed live in three adopting modals: inbox-panel.tsx's
// Google Calendar iframe (the ONLY content of that dialog, so it was a
// Close-button-only dead end), PageEditorModal.tsx's live page preview
// iframe, and FilePreviewModal.tsx's preview iframe (already shipped in
// wave 2). Both additions are self-limiting, so neither needs its own
// inclusion logic here: per the HTML spec the tabIndex IDL attribute
// defaults to 0 for an iframe, and to 0 for a summary that is ITS PARENT
// details element's summary (-1 for any other summary), and orderTabbables
// already excludes tabIndex === -1 outright - so a stray summary outside a
// details element excludes itself with no extra code in this file.
// `[draggable]` is deliberately NOT added: a draggable element is not
// tabbable by default.
const FOCUSABLE_SELECTOR =
  'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"], audio[controls], video[controls], iframe, summary';

function queryTabbables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/**
 * Builds the plain descriptor orderTabbables expects for one candidate
 * element. `hidden` also checks `offsetParent === null` (true for
 * `display: none`, harmlessly also true for `position: fixed` - nothing
 * this mechanism scopes to is fixed-positioned inside a dialog body) rather
 * than only the HTML `hidden` attribute, because the real case decision 7
 * documents - a Close button hidden while a save is in flight - is exactly
 * as likely to be a CSS `display: none` toggle as the attribute.
 */
function descriptorFor(el: HTMLElement, index: number): TabbableDescriptor {
  const disabled = Boolean((el as unknown as { disabled?: boolean }).disabled) || el.getAttribute("aria-disabled") === "true";
  return {
    index,
    tabIndex: el.tabIndex,
    disabled,
    hidden: el.hidden || el.offsetParent === null,
  };
}

/**
 * Initial focus (AC4) and the trap's "no tabbable at all" fallback both
 * land here: the first tabbable per orderTabbables, or the container itself
 * when there is none (decision 7's documented fallback - the container
 * MUST already carry `tabIndex={-1}` for this call to do anything; without
 * it `.focus()` on a non-focusable element is a silent no-op and focus is
 * left wherever it already was, which for an initial-open call is
 * <body>). ModalShell sets that attribute unconditionally; a Tier 3/4
 * adopter keeping its own markup has to add it itself.
 */
function focusFirstTabbable(container: HTMLElement): void {
  const elements = queryTabbables(container);
  const order = orderTabbables(elements.map(descriptorFor));
  if (order.length > 0) {
    elements[order[0]].focus();
    return;
  }
  container.focus();
}

/**
 * Moves focus one step along the trap's order, wrapping at either end - the
 * hand-rolled replacement for the usual sentinel-`<div>` trap technique,
 * which ModalShell's "exactly two elements, nothing between them" contract
 * (decision 2, entry 257 check 4's focus-ring inheritance) rules out. Falls
 * back to the container when there is nothing tabbable, same as
 * focusFirstTabbable and for the same reason.
 */
function moveTrapFocus(container: HTMLElement, action: "trap-forward" | "trap-back"): void {
  const elements = queryTabbables(container);
  const order = orderTabbables(elements.map(descriptorFor));
  if (order.length === 0) {
    container.focus();
    return;
  }
  const activeIndex = elements.indexOf(document.activeElement as HTMLElement);
  const currentPos = order.indexOf(activeIndex);
  const step = action === "trap-forward" ? 1 : -1;
  const nextPos = currentPos === -1 ? (action === "trap-forward" ? 0 : order.length - 1) : (currentPos + step + order.length) % order.length;
  elements[order[nextPos]].focus();
}

/**
 * Walks up from `node` collecting the plain ancestor descriptors
 * isInsideModalOrItsPopup expects, nearest first - the one place this file
 * touches `classList`/`getAttribute` directly, so the pure predicate itself
 * never has to know a real DOM node exists. `isModalRoot` marks `modalRoot`
 * itself; nothing else in the chain can ever be true for it, matching what
 * the predicate's own tests encode.
 */
function ancestorChainOf(node: Element | null, modalRoot: Element): ModalAncestorDescriptor[] {
  const chain: ModalAncestorDescriptor[] = [];
  let current: Element | null = node;
  while (current) {
    chain.push({
      isModalRoot: current === modalRoot,
      role: current.getAttribute("role") ?? undefined,
      classNames: Array.from(current.classList),
    });
    current = current.parentElement;
  }
  return chain;
}

export interface UseModalDismissOptions {
  /** Whether this modal is currently open. Required even for a modal that
   * is only ever MOUNTED while open (every family-A site today renders
   * `{state && <Modal />}`, so pass `true` unconditionally there - see
   * ModalShell.tsx) - a modal kept mounted while logically closed
   * (AccessibilityCenter's four always-mounted children, REGRESSION entry
   * 273 check 7) needs the real boolean, and this hook cannot tell the two
   * shapes apart on its own. */
  open: boolean;
  /** Called for every dismissal request - Escape, or whatever else the
   * caller wires to it. NEVER treated as the modal's actual close (decision
   * 6, AC5): CommentEditModal refuses to close while dirty and shows a
   * discard confirmation instead, and GradableEditorModal closes through
   * its own closeModal. This hook has no opinion on when a modal actually
   * closes - that policy is entirely this function. */
  onDismiss: () => void;
  /** The element to return focus to once this modal closes, captured by the
   * CALLER at the moment it opened the modal - e.g. `event.currentTarget`
   * in the opening button's `onClick`. Deliberately never read from
   * `document.activeElement` inside this hook (decision 9): React
   * reconciliation can blur to `document.body` before a restore effect
   * ever runs, and Safari does not focus a button on click, so "whatever is
   * focused right now" is not reliably "the control that opened this" at
   * either end of the round trip. AttachmentsPanel.tsx's own
   * `previewTriggerRef` is the exact precedent this mirrors. Omit when
   * there is no sensible opener to return to. */
  restoreFocusRef?: RefObject<HTMLElement | null>;
}

export interface UseModalDismissResult {
  /** Attach to the dialog's CONTENT element - the same node that carries
   * `role="dialog"` and the accessible name (decision 3). The trap and the
   * initial-focus search both scope to this node, so it also needs
   * `tabIndex={-1}` for decision 7's fallback to have anything to focus. */
  containerRef: RefObject<HTMLElement | null>;
}

export function useModalDismiss({ open, onDismiss, restoreFocusRef }: UseModalDismissOptions): UseModalDismissResult {
  const containerRef = useRef<HTMLElement | null>(null);
  // A stable identity for this hook instance in the shared stack - useId
  // rather than a ref-held counter, since it needs no DOM and is already
  // guaranteed unique and stable across this instance's re-renders.
  const modalId = useId();

  // Registration (AC2, AC3, decision 5). This modal counts toward the
  // shared stack for exactly as long as it is open, however "closed" is
  // spelled for this particular caller (unmount, or a still-mounted
  // `open: false`) - both end the same way, a cleanup that removes this id.
  useEffect(() => {
    if (!open) return;
    modalStack.open(modalId);
    return () => modalStack.close(modalId);
  }, [open, modalId]);

  // Initial focus (decision 7, AC4): the first tabbable control, never the
  // container that merely holds it - except when there genuinely is none,
  // where the container is the documented fallback (focusFirstTabbable
  // itself makes that call).
  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;
    focusFirstTabbable(container);
  }, [open]);

  // Focus restoration (decision 9, AC4): "a ref captured when the modal was
  // opened" means exactly that - `opener` below is read ONCE, when this
  // effect body runs at open time, not re-read from `restoreFocusRef.current`
  // inside the cleanup. By the time the cleanup runs (on close or unmount),
  // React may already have reassigned or nulled the ref's `.current` for
  // reasons that have nothing to do with restoration - reading it fresh
  // there would restore focus to whatever the ref happens to point at NOW,
  // not to the opener this specific modal instance actually opened for.
  // `connected` is likewise checked at CLOSE time (inside the cleanup, on
  // the captured node), since THAT is what decides whether the opener
  // survived the modal being open at all.
  useEffect(() => {
    if (!open) return;
    const opener = restoreFocusRef?.current ?? null;
    return () => {
      const candidates: RestoreCandidate<HTMLElement>[] = opener ? [{ value: opener, connected: opener.isConnected }] : [];
      // Null covers both "no ref was ever supplied" and "the element it
      // named has since left the document" - either way there is nothing
      // to call .focus() on, and deliberately nothing else is called
      // either. A `?? document.body` fallback would never throw while
      // doing exactly the thing decision 9 warns against.
      restoreTarget(candidates)?.focus();
    };
  }, [open, restoreFocusRef]);

  // Escape-to-close and the hand-rolled Tab trap (AC2, AC3, decision 4/5).
  // One document-level keydown listener per open modal instance, gated on
  // isTopmost so a modal further down the stack neither closes nor traps
  // while something else is on top of it. Listens on the bubble phase (the
  // default - no `capture: true`), matching the existing Escape handlers
  // already in this codebase (AttachmentPreviewModal.tsx), which is what
  // lets modalKeyAction's defaultPrevented check (AC2) actually see
  // whether an inline editor's own onKeyDown already claimed the key.
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!modalStack.isTopmost(modalId)) return;
      const action = modalKeyAction({
        key: event.key,
        shiftKey: event.shiftKey,
        defaultPrevented: event.defaultPrevented,
      });
      if (action === null) return;

      if (action === "close") {
        onDismiss();
        return;
      }

      const container = containerRef.current;
      if (!container) return;

      const activeElement = document.activeElement instanceof Element ? document.activeElement : null;

      // The trap only computes a POSITION when focus is a literal DOM
      // descendant of the container - moveTrapFocus needs somewhere to step
      // from. When it is not, that is one of two very different situations,
      // and treating them the same is the AC3 bug this used to have:
      //
      //  1. Focus is inside a portalled MUI popup (a Select listbox, a
      //     Popover/Modal root) living at document.body, outside the
      //     container by construction. isInsideModalOrItsPopup (built from
      //     ancestorChainOf) still counts this as "inside" per decision 4.
      //     Tab must be left alone here - no preventDefault - so MUI's own
      //     handling runs; yanking focus back would silently close the
      //     dropdown, the exact failure decision 4 records.
      //  2. Focus has genuinely gone adrift: `activeElement` is null (a
      //     focused control UNMOUNTED while the dialog stayed open - e.g.
      //     CourseCopyModal's phase transitions - which resets focus to
      //     <body> and fires no focusin, so the safety net below never
      //     runs), or it names some element behind the backdrop. Returning
      //     here without preventDefault would let the browser perform a
      //     NATIVE Tab from <body>/wherever, landing on the first tabbable
      //     in the whole document - behind the backdrop, announced by a
      //     screen reader, in violation of AC3. This branch must
      //     preventDefault and pull focus back into the dialog itself, the
      //     same recovery the focusin safety net performs, rather than wait
      //     for a focusin event that adrift focus never generates.
      if (!container.contains(activeElement)) {
        const chain = ancestorChainOf(activeElement, container);
        if (isInsideModalOrItsPopup(chain)) return;
        event.preventDefault();
        focusFirstTabbable(container);
        return;
      }

      event.preventDefault();
      moveTrapFocus(container, action);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, modalId, onDismiss]);

  // The trap's safety net (decision 4, AC3): catches focus that left the
  // modal by a path the keydown handler above never sees - a programmatic
  // .focus() call elsewhere in the page, or focus moving OUT of an open
  // popup rather than being cycled within it. isInsideModalOrItsPopup is
  // what keeps this from fighting a portalled MUI Select the same way the
  // keydown handler avoids it: focus arriving inside the listbox is
  // accepted, not redirected, so the dropdown stays usable.
  useEffect(() => {
    if (!open) return;

    const handleFocusIn = (event: FocusEvent) => {
      if (!modalStack.isTopmost(modalId)) return;
      const container = containerRef.current;
      if (!container) return;
      const chain = ancestorChainOf(event.target instanceof Element ? event.target : null, container);
      if (isInsideModalOrItsPopup(chain)) return;
      focusFirstTabbable(container);
    };

    document.addEventListener("focusin", handleFocusIn);
    return () => document.removeEventListener("focusin", handleFocusIn);
  }, [open, modalId]);

  return { containerRef };
}
