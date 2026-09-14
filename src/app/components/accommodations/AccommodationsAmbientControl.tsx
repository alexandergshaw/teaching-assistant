"use client";

// Globally mounted, always-present control that opens the accommodations
// panel (backlog N4). Mounted once in src/app/layout.tsx, as a sibling of
// SelectionChatWidget/AiChatFab/ContextMenu.
//
// AC-S5 - nothing about the list is derivable from the collapsed control:
// this component holds exactly one piece of state, `open` (a literal
// `false` initializer - never read from localStorage, which is also what
// AC-S3 requires: default-collapsed, no storage-seeded open state). It
// performs NO fetch of any kind on mount or ever, itself - the button below
// renders one constant SVG icon and one constant aria-label/title string,
// unconditionally, regardless of `open`, regardless of whether any
// accommodations data exists anywhere, and regardless of the currently
// selected scope. No numeral, no dot, no conditional class or colour. This
// markup is identical on every render of this component, in every state.
//
// Requirement 7 (no provider, no fetch before open): AccommodationsPanel is
// mounted ONLY while `open` is true (a conditional render, not an
// always-mounted-but-hidden one). That is this control's entire mechanism
// for "the panel holds no data until opened, fetches on open, drops it on
// close" - the panel component is unmounted on close, so its data-fetch
// state (courses/assignments/roster/entries) is discarded by React, not by
// a bespoke cleanup this file would have to get right on its own.
import { useRef, useState } from "react";
import AccommodationsPanel from "./AccommodationsPanel";
// Reuses AccommodationsPanel.module.css's .fab rule rather than a separate
// stylesheet - this wave's file list does not include a third CSS file.
import styles from "./AccommodationsPanel.module.css";

const LABEL = "Accommodations and extensions";

export default function AccommodationsAmbientControl() {
  const [open, setOpen] = useState(false);
  // Captured at the moment this button opens the panel - AttachmentsPanel.
  // tsx's previewTriggerRef is the exact precedent (see ModalShell.tsx's
  // `restoreFocusRef` doc comment for why this can never be inferred from
  // document.activeElement instead). Forwarded to AccommodationsPanel, which
  // forwards it unchanged to ModalShell.
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  return (
    <>
      <button
        type="button"
        className={styles.fab}
        onClick={() => setOpen(true)}
        aria-label={LABEL}
        title={LABEL}
        ref={triggerRef}
      >
        <AccommodationIcon />
      </button>
      {open && <AccommodationsPanel onClose={() => setOpen(false)} restoreFocusRef={triggerRef} />}
    </>
  );
}

function AccommodationIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
      <path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 5a3 3 0 0 1 6 0v3H9Z" />
    </svg>
  );
}
