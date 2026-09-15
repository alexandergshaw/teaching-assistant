// Snapshot grading, N14 WAVE 1 (scratchpad/n14-architecture.md section 7,
// scratchpad/n14-ledger.md Ruling N14-1/N14-4/N14-17): the extracted
// keydown-wiring hook. This is not only a line-budget move - it is the fix
// for Ruling N14-4's own finding that a chord predicate wired inline in a
// .tsx cannot be tested at all in this repo (vitest is node-env and renders
// no component). The matcher and eligibility guard already live in
// snapshot-keys.ts as pure leaves; this file is the one remaining untestable
// half - the actual `window.addEventListener("keydown", ...)` wiring - and
// it stays untestable by CONTENT, but its EXISTENCE and the panel's call
// into it are pinned by the wiring canary in
// snapshot-grading.structure.test.ts (Ruling N14-17), mirroring the A4d
// canary's own technique there.
//
// Mirrors useSnapshotGrade.ts's own shape (UseSnapshotGradeParams): a hook
// that takes the panel's setters/refs/callbacks as constructor parameters
// and wires up behaviour, rather than a bare function the panel would have
// to remember to call from its own effect.
//
// M2 correction (n14-architecture.md section 0a): nextStudentCounts itself
// stays in the panel (it is also rendered directly in JSX there) - only the
// ref-freshness CACHE built on top of it was DESIGNED to move here. Built
// this way instead: the panel keeps the useRef/useEffect pair that keeps the
// cache fresh (see SnapshotGradingPanel.tsx's own comment at that
// declaration) because removing it from the panel entirely was verified,
// empirically, to break eslint's react-compiler `preserve-manual-
// memoization` check on an unrelated callback elsewhere in that component -
// a whole-component memoization-inference quirk, not a real bug. This hook
// receives the already-fresh REF directly and only ever reads `.current`,
// so the freshness cache still exists in exactly one place, never
// duplicated.

import { useEffect, type MutableRefObject } from "react";
import { describeNextStudentCounts, type NextStudentCounts, type SnapshotRole } from "./snapshot-shot";
import { isSnapshotShortcutEligible, matchSnapshotKeyEvent } from "./snapshot-keys";

export interface UseSnapshotKeyboardShortcutsParams {
  /** Guard 1: activeRef.current - this panel is the visible sub-tab. */
  activeRef: MutableRefObject<boolean>;
  handleSnap: () => void;
  setArmedRole: (role: SnapshotRole) => void;
  setNextStudentArmed: (armed: boolean) => void;
  /** MAJOR-3: focused on arm so Escape/Enter can reach the control immediately. */
  nextStudentButtonRef: MutableRefObject<HTMLButtonElement | null>;
  /**
   * The panel's own ref-freshness cache over its computed nextStudentCounts
   * value (see SnapshotGradingPanel.tsx's own comment on this ref's
   * declaration for why it is built in the panel, not here). This hook only
   * ever reads `.current`, never writes it.
   */
  nextStudentCountsRef: MutableRefObject<NextStudentCounts>;
  announce: (message: string) => void;
}

/**
 * U4/X6: THE keyboard binding, gated by all three guards, in order (entry
 * 424a pins this order - active, then editable-target, then modal). The
 * three guards still read the DOM here (activeRef, target.closest,
 * document.querySelector) and are resolved to plain booleans, then handed to
 * isSnapshotShortcutEligible (snapshot-keys.ts) so the eligibility decision
 * itself is testable. What the eligible keystroke MEANS is decided by
 * matchSnapshotKeyEvent (also snapshot-keys.ts) - N14 WAVE 1 extends that
 * matcher with the Alt+G "arm-next-student" chord (Ruling N14-8: exclusive
 * Alt only, AltGr matches nothing).
 */
export function useSnapshotKeyboardShortcuts({
  activeRef,
  handleSnap,
  setArmedRole,
  setNextStudentArmed,
  nextStudentButtonRef,
  nextStudentCountsRef,
  announce,
}: UseSnapshotKeyboardShortcutsParams): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const eligible = isSnapshotShortcutEligible({
        isActive: activeRef.current,
        // This selector is copied from useRecorder.ts:882-884 and must not
        // drift from it independently.
        isInsideEditableTarget: !!target.closest("input, textarea, select, [contenteditable]"),
        isModalOpen: !!document.querySelector('[aria-modal="true"]'),
      });
      if (!eligible) return;

      const match = matchSnapshotKeyEvent(e);
      if (match.type === "snap") {
        handleSnap();
        return;
      }
      if (match.type === "arm-next-student") {
        setNextStudentArmed(true); // arms only - never auto-confirms
        // MAJOR-3: move focus onto the control so the keyboard can then
        // cancel (Escape) or confirm (Enter) it - see nextStudentButtonRef's
        // own declaration comment (still in the panel) for why this is safe
        // to do immediately rather than in an effect keyed off the armed
        // state.
        nextStudentButtonRef.current?.focus();
        // Reads the ref, not the parameter directly - this effect's own
        // dependency array is unchanged by this branch, so a direct
        // reference here would freeze at whatever count was live on the
        // render that registered this listener.
        announce(describeNextStudentCounts(nextStudentCountsRef.current));
        return;
      }
      if (match.type === "arm-role") {
        setArmedRole(match.role);
        announce(`Armed ${match.role}.`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    activeRef,
    handleSnap,
    setArmedRole,
    setNextStudentArmed,
    nextStudentButtonRef,
    nextStudentCountsRef,
    announce,
  ]);
}
