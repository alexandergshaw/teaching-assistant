"use client";

// The shared modal shell every Tier 1/2 site adopts -
// docs/modal-dismissal-focus-acceptance-criteria.md decision 1. Renders
// EXACTLY `.previewBackdrop` wrapping `.previewModal`, and nothing between
// them (decision 2) - not a stylistic choice: REGRESSION entry 257 check 4
// pins a `--focus-ring-color` reset on `.previewModal` because
// GradingResults's two overlays render inline (no portal) inside
// LiveFeedPanel's navy `.lfDetail` pane, and custom-property inheritance
// only reaches exactly that class. An extra wrapper level here, or a
// renamed class, would silently revert the ring to unreadable on that one
// screen - and nothing in this repo's test suite would catch it, because
// nothing renders (focusRing.wiring.test.ts reads CSS as text; it has no
// way to see a DOM level this component might insert).
//
// role="dialog", aria-modal="true" and the accessible name all move onto
// the CONTENT element (decision 3), never the backdrop - today 12
// family-A2 sites put the role on a full-viewport backdrop with no
// accessible name at all (REGRESSION entry 273 check 1). `label` is
// REQUIRED so a missing name is a compile error, not an omission a review
// has to catch.
//
// This component is only ever MOUNTED while open - every existing family-A
// site already renders its modal that way (`{state && <Modal />}`; see
// GeneratedPreviewModal.tsx, which has no `open` prop of its own either),
// so useModalDismiss is always called with `open: true` here. A modal that
// must stay mounted while logically CLOSED cannot use this shell at all, and
// would need the hook directly with a real boolean - see useModalDismiss's
// own `open` doc comment for the rule and for why a hardcoded `true` from
// such a component is a phantom stack entry rather than a cosmetic slip.
// AccessibilityCenter's slide-in panel is that case (REGRESSION entry 273
// check 7 - the PARENT is mounted always; its four children are a ternary
// chain and unmount with it), and the AC carves it out to its own later,
// one-at-a-time wave.
import type { CSSProperties, ReactNode, RefObject } from "react";
import { useModalDismiss } from "./useModalDismiss";
import styles from "../../page.module.css";

export interface ModalShellProps {
  /** The dialog's accessible name (decision 3, AC6). Required - see this
   * file's header comment. */
  label: string;
  /** Called for every dismissal request (Escape, or a backdrop click, which
   * this shell also wires to it - every current family-A site treats a
   * backdrop click as a close). NEVER the modal's actual close handler
   * (decision 6, AC5): the caller's own policy - a dirty-check confirmation,
   * a closeModal that does more than unmount - runs first. */
  onDismiss: () => void;
  /** The element to return focus to once this modal closes, captured by the
   * CALLER at the moment it opened the modal (e.g. `event.currentTarget` in
   * the opening button's `onClick` - AttachmentsPanel.tsx's
   * `previewTriggerRef` is the exact precedent). See useModalDismiss's own
   * doc comment for why this can never be inferred from
   * `document.activeElement` instead. Omit when there is no sensible
   * opener to return to. */
  restoreFocusRef?: RefObject<HTMLElement | null>;
  /** Zero or more additional candidates, tried in order, after
   * `restoreFocusRef`, when that element is no longer connected by close
   * time (docs/modal-focus-restoration-acceptance-criteria.md AC1).
   * Forwarded to `useModalDismiss` unchanged - see its own
   * `fallbackFocusRefs` doc comment for the full rationale and the
   * capture-at-open/connected-at-close rules every candidate follows. */
  fallbackFocusRefs?: readonly RefObject<HTMLElement | null>[];
  /** Inline style applied to the content `section`, for callers that need a
   * narrower (or otherwise non-default) size than this shell's 980px
   * default - e.g. a site that carried its own width before adopting this
   * shell. This is the section's only inline style source (the shell itself
   * never sets one), so it is passed through as-is, not merged. */
  contentStyle?: CSSProperties;
  /** Extra class(es) appended AFTER `styles.previewModal` (never instead of
   * it - see this file's header comment on why that class can't be lost or
   * renamed). Use for cases `contentStyle` alone can't express. */
  contentClassName?: string;
  children: ReactNode;
}

export function ModalShell({
  label,
  onDismiss,
  restoreFocusRef,
  fallbackFocusRefs,
  contentStyle,
  contentClassName,
  children,
}: ModalShellProps) {
  const { containerRef } = useModalDismiss({ open: true, onDismiss, restoreFocusRef, fallbackFocusRefs });

  return (
    <div className={styles.previewBackdrop} onClick={onDismiss}>
      <section
        className={contentClassName ? `${styles.previewModal} ${contentClassName}` : styles.previewModal}
        style={contentStyle}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        // Decision 7's documented fallback target - see useModalDismiss's
        // focusFirstTabbable. Harmless when unused: -1 keeps this element
        // out of the natural Tab sequence, so it never competes with a real
        // tabbable descendant for the initial-focus slot.
        tabIndex={-1}
        ref={containerRef}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </section>
    </div>
  );
}
