import type { ClassTrendsDraftResult } from "@/lib/grade/class-trends-draft";

/**
 * Layer C's UI-state transition logic, extracted as a pure leaf - no React
 * import, no DOM reference - so it can be given a real runtime test in this
 * repo's node-env vitest suite, mirroring the precedent this same feature
 * area already proved out: `slotsReducer`
 * (walkthrough-announcement/announcement-draft-slots.ts:372) is a plain
 * exported function tested directly with no render
 * (announcement-draft-slots.test.ts:537-552's "copy-result" success/failure
 * pair), while its surrounding `useReducer` hook is not extractable and is
 * only a reading claim. `ClassTrendsDraftPanel.tsx`'s own wiring around this
 * function - that its button click calls composeClassTrendsDraft and feeds
 * the result through nextDraftUiState, and that its Copy button's
 * writeClipboardText call dispatches a "copy-settled" event on both
 * `.then`/`.catch` arms - is a source-text wiring claim
 * (classTrendsDraft.wiring.test.ts), not something this file's own tests can
 * prove; this file only proves the TRANSITION logic itself.
 */

export type DraftUiState =
  | { status: "idle" }
  | { status: "ready"; markdown: string; copy: "idle" | "copied" | "error" }
  /** Composed successfully but with no body clauses at all - see
   * ClassTrendsDraftResult's "empty" variant. The panel renders the
   * explanation and withholds the copy control entirely for this status;
   * this is an explicit state precisely so no caller can mistake an
   * empty-string markdown for "nothing to copy" and accidentally still
   * offer the control. */
  | { status: "empty" }
  | { status: "below-floor"; floor: number; totalResults: number }
  | { status: "rejected"; reason: string };

export type DraftUiEvent =
  | { type: "composed"; result: ClassTrendsDraftResult }
  | { type: "copy-settled"; ok: boolean };

export function nextDraftUiState(state: DraftUiState, event: DraftUiEvent): DraftUiState {
  if (event.type === "composed") {
    switch (event.result.status) {
      case "ok":
        return { status: "ready", markdown: event.result.markdown, copy: "idle" };
      case "empty":
        return { status: "empty" };
      case "below-floor":
        return { status: "below-floor", floor: event.result.floor, totalResults: event.result.totalResults };
      case "rejected":
        return { status: "rejected", reason: event.result.reason };
    }
  }

  // "copy-settled" only means anything once a draft exists; a settle that
  // arrives against any other state (e.g. a stale promise after the user
  // recomposed) is ignored rather than corrupting an unrelated state - the
  // same defensive no-op shape slotsReducer's own "does-not-exist" id cases
  // use (announcement-draft-slots.test.ts:284,306,335,552).
  if (event.type === "copy-settled" && state.status === "ready") {
    return { ...state, copy: event.ok ? "copied" : "error" };
  }
  return state;
}
