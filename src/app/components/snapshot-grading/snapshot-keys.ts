// Snapshot grading (docs/snapshot-grading-acceptance-criteria.md), N14 WAVE 0:
// the keyboard layer's pure leaf. No React, no hooks, no `document`, no DOM
// types - vitest here is node-env and renders nothing, so every behaviour
// that needs a unit test lives here, matching this directory's own
// snapshot-shot.ts precedent.
//
// THE SPLIT (be honest about it, per Ruling N14-4): three of the panel's
// guards are inherently DOM-shaped - activeRef.current (a ref), whether the
// event's target sits inside an input/textarea/select/[contenteditable]
// (needs Element.closest), and whether an aria-modal element exists anywhere
// in the document (needs document.querySelector). None of that moves here.
// What moves is the DECISION those three facts make once resolved to plain
// booleans by the caller - isSnapshotShortcutEligible below takes the
// booleans, not an Element or a ref. That is not the guard disappearing; it
// is the guard's DOM-reading half staying in the panel (the only place that
// can read it) while its boolean-logic half becomes testable here.

import type { SnapshotRole } from "./snapshot-shot";

// ---------------------------------------------------------------------------
// ROLE_BY_DIGIT - moved verbatim from SnapshotGradingPanel.tsx:73-80.
// ---------------------------------------------------------------------------

export const ROLE_BY_DIGIT: Record<string, SnapshotRole> = {
  "1": "assignment",
  "2": "rubric",
  "3": "post",
  "4": "replies",
  "5": "submission",
  "6": "other",
};

// ---------------------------------------------------------------------------
// The eligibility guard - the non-DOM half of the three guards baselined in
// docs/REGRESSION.md entry 424a. The panel resolves each fact (is this panel
// the active sub-tab, is the event's target inside an editable field, is a
// modal open anywhere) and passes the three booleans in; this function only
// combines them, in the SAME logical order entry 424a records (active first,
// then editable-target, then modal), so a future reordering of the boolean
// checks would still show up as a diff here even though the DOM reads
// themselves cannot be exercised by any test in this repo.
// ---------------------------------------------------------------------------

export interface SnapshotShortcutEligibility {
  /** Guard 1: activeRef.current - this panel is the visible sub-tab. */
  isActive: boolean;
  /** Guard 2: e.target.closest("input, textarea, select, [contenteditable]") found a match. */
  isInsideEditableTarget: boolean;
  /** Guard 3: document.querySelector('[aria-modal="true"]') found a match. */
  isModalOpen: boolean;
}

export function isSnapshotShortcutEligible({
  isActive,
  isInsideEditableTarget,
  isModalOpen,
}: SnapshotShortcutEligibility): boolean {
  if (!isActive) return false;
  if (isInsideEditableTarget) return false;
  if (isModalOpen) return false;
  return true;
}

// ---------------------------------------------------------------------------
// The matcher - what a (guard-eligible) keystroke means. Bare "s", bare "n",
// bare "1"-"6" only; no chord is bound by this wave, and none of the design
// still being written for the chord layer is anticipated here.
// ---------------------------------------------------------------------------

export type SnapshotKeyMatch =
  | { type: "snap" }
  | { type: "arm-next-student" }
  | { type: "arm-role"; role: SnapshotRole }
  | { type: "none" };

/**
 * The shape of the parts of a KeyboardEvent this matcher needs - deliberately
 * a plain object, not `KeyboardEvent`, so a test can construct one without a
 * DOM.
 */
export interface SnapshotKeyLike {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  /**
   * KeyboardEvent.repeat - true for the synthetic repeat events an OS/browser
   * fires while a key is held down. Ruling N14-7 (scratchpad/n14-ledger.md)
   * authorises blocking these for every binding below, bare keys included:
   * without this, holding S down filed shots until MAX_SHOTS because nothing
   * checked it. The panel passes the real KeyboardEvent through unchanged, so
   * this field is populated by the browser, not computed here.
   */
  repeat: boolean;
}

const NO_MATCH: SnapshotKeyMatch = { type: "none" };

// THE DEFECT FIX (entry 424a: grep for ctrlKey/altKey/metaKey/shiftKey in the
// panel returned zero hits, so Ctrl+Alt+S snapped exactly like bare S). Any
// keystroke holding ctrl, alt, or meta now matches nothing, full stop -
// those three are the modifiers with reserved OS/browser chord meaning
// (Ctrl+S "save", Alt+<letter> menu mnemonics, Cmd/Meta app-level shortcuts
// on macOS), so a single-letter or single-digit binding must never fire
// underneath one of them.
//
// Shift is decided separately and deliberately NOT blocked. Two reasons:
// (1) the pre-existing "s"/"n" branches already compare on `e.key.toLowerCase()`,
// so a capital "S" - which is what Shift+S actually produces - already
// matched today, and continuing to allow it changes nothing about that
// existing behaviour; (2) unlike ctrl/alt/meta, a lone Shift+<letter> or
// Shift+<digit> carries no reserved OS/browser shortcut meaning to protect -
// it is indistinguishable, at the level of "what did the instructor mean to
// press", from a slightly mistimed Shift held over from the previous
// keystroke or a genuine capital letter, and gating on it would make the
// bare bindings flicker based on incidental case rather than fixing a real
// collision. So shiftKey is read into SnapshotKeyLike for completeness and
// intentionally ignored by every branch below.
export function matchSnapshotKeyEvent(event: SnapshotKeyLike): SnapshotKeyMatch {
  // Ruling N14-7: a repeating keystroke (the OS/browser auto-repeat fired
  // while a key is held) matches nothing, for every binding below including
  // the bare keys - see the SnapshotKeyLike.repeat doc-comment.
  if (event.repeat) return NO_MATCH;
  if (event.ctrlKey || event.altKey || event.metaKey) return NO_MATCH;

  const key = event.key.toLowerCase();
  if (key === "s") return { type: "snap" };
  if (key === "n") return { type: "arm-next-student" };

  // Raw e.key, not lower-cased, matching SnapshotGradingPanel.tsx:550's
  // original lookup verbatim - ROLE_BY_DIGIT's keys are the digit characters
  // themselves, and digits have no case.
  const role = ROLE_BY_DIGIT[event.key];
  if (role) return { type: "arm-role", role };

  return NO_MATCH;
}
