// The single named component that carries the unselectable treatment for
// every accommodations-derived string (backlog N4, requirement 1 of the UI
// build brief).
//
// WHY A NAMED COMPONENT, NOT A CONTAINER-SCOPED CSS RULE: MUI 9.0.1 renders
// several components (Autocomplete/Menu/Dialog) into document.body PORTALS,
// so a `user-select: none` rule scoped to a panel's root container would NOT
// reach content that portals out of that root. This panel does not use a
// portal-rendering picker (see AccommodationsPanel.tsx's student picker,
// which is a plain native <select> for exactly this reason), but the rule
// stands regardless of which control renders the text: because the
// treatment travels WITH this component, wherever React mounts an instance
// of it, the element rendering the text is the element carrying the rule -
// not dependent on where in the tree that turns out to be.
//
// EVERY accommodations-derived string (resolved student name, note text,
// raw canvas id shown as a fallback, resolved course/assignment name) must
// render through this component. accommodations.wiring.test.ts asserts this
// by source-text inspection of this file and of AccommodationsPanel.tsx.
//
// WHAT THIS DOES NOT DO (stated plainly, not hidden - see this file's own
// header comment in AccommodationsPanel.module.css for the fuller version):
// `user-select: none` is a selection-eligibility property. It is defeated
// outright by browser PRINT / Save-as-PDF, and find-in-page still works as
// a disclosure oracle regardless of this rule. This is a capture-surface
// reduction against the in-page drag-select-to-model-prompt path
// (SelectionChatWidget.tsx's window.getSelection() read), NOT a
// confidentiality boundary against the owner's own tooling, devtools, or a
// screen reader's text extraction. Nothing here should ever be described,
// in code or in UI copy, as "protecting" or "hiding" this data - it narrows
// one specific accidental-leak path.
import type { ReactNode } from "react";
import styles from "./AccommodationsPanel.module.css";

export default function AccommodationsText({
  children,
  as: Tag = "span",
  className,
}: {
  children: ReactNode;
  /** Rendering element - defaults to a plain inline span. */
  as?: "span" | "div" | "p";
  className?: string;
}) {
  const combined = className ? `${styles.entryText} ${className}` : styles.entryText;
  return <Tag className={combined}>{children}</Tag>;
}
