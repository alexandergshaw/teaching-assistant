"use client";

import { useCallback, useRef, useState } from "react";
import {
  applyInstitutionSelection,
  filterInstitutions,
  nextHighlightIndex,
  orderInstitutions,
  parseInstitutionTrigger,
} from "@/lib/chat/institution-trigger";

/**
 * State machine for the "@institution" typeahead in the chat composer (see
 * SPEC-TYPEAHEAD.md sections 3-4). Wraps the pure functions in
 * `@/lib/chat/institution-trigger` (owned by a sibling group) with the
 * stateful pieces that ARE this component's own concern: which token is
 * currently open, which option is highlighted, the Escape-dismissal guard,
 * and the polite-live-region text for the popup's own open/filter/empty
 * announcements (items 19-22 in the copy sheet - resolution announcements,
 * items 23+, are a completely separate concern owned by the caller that
 * loads the institution's pages, surfaced through its own `liveMessage`
 * prop rather than through this hook).
 *
 * Every mutating method here reads and writes `stateRef` synchronously
 * (rather than relying on a functional `setState` updater, whose callback
 * is not guaranteed to run before the call returns) so that `select()` can
 * hand back a definitive result - the spliced text, the caret, and which
 * institution was picked - in the same tick a keystroke or click handler
 * needs it.
 */

type TriggerShape = "closed" | "empty" | "no-match" | "matches";

export interface InstitutionTriggerState {
  /** Whether the composer's caret currently sits inside a recognized
   * "@query" token AND the token has not been dismissed (Escape). This is
   * the ARIA `aria-expanded` value's source, not merely "matches.length >
   * 0" - a token with zero matches is still `open` (so its hint renders),
   * just not interactive (see `hasMatches` below for that distinction). */
  open: boolean;
  /** Text typed after "@", up to the caret, as of the last recompute. */
  query: string;
  /** Index of the "@" that opened the current token. */
  start: number;
  /** Ordered, filtered institution codes for the current query. Empty
   * whenever there is nothing to select - either no institutions are
   * registered at all, or none match the typed query. */
  matches: string[];
  /** Index into `matches` that is currently highlighted. Meaningless (and
   * never read) while `matches` is empty. */
  highlightIndex: number;
  /** True when the caller's institution list itself is empty - distinct
   * from "query matched nothing" so the popup can show the right one of
   * the two hint messages (SPEC-TYPEAHEAD.md section 9, items 1-2). */
  institutionsEmpty: boolean;
  /** Text for the always-mounted polite live region's popup-side
   * announcements. "" when there is nothing new to say - the caller merges
   * this with its own resolution-side `liveMessage` prop, falling back to
   * that prop whenever this is empty (the two are temporally disjoint: this
   * text is only ever non-empty while the popup itself is open). */
  liveMessage: string;
}

export interface UseInstitutionTriggerArgs {
  /** The feature's entire on/off gate (mirrors `institutionTypeahead`'s
   * presence on AiChatWindow) - false makes every method here a no-op and
   * `open` permanently false, so a caller that never enables this gets
   * behavior identical to the hook not existing at all. */
  enabled: boolean;
  institutions: string[];
  /** Hoisted to the front of the ordered list (see `orderInstitutions`) -
   * typically the institution currently selected in Settings. */
  activeInstitution: string;
}

export interface InstitutionSelectionOutcome {
  text: string;
  caret: number;
  code: string;
}

export interface UseInstitutionTriggerResult extends InstitutionTriggerState {
  /** Recompute trigger state from the composer's current text and caret
   * position. Call this from onChange, onKeyUp, onClick and onSelect - see
   * SPEC-TYPEAHEAD.md section 3 on why onChange alone is not enough (an
   * ArrowLeft out of the token changes the caret without changing the
   * text, and onChange never fires for that). */
  recompute: (text: string, caret: number) => void;
  /** Move the highlight by `delta` (wraps both ends). No-op while there is
   * nothing to highlight. */
  moveHighlight: (delta: number) => void;
  /** Escape: close without touching the text, and remember the dismissed
   * token so re-typing the same (or a longer) token does not immediately
   * reopen the popup - only a token that diverges from what was dismissed,
   * or a fresh "@", opens it again. */
  dismiss: () => void;
  /** Hard reset with no dismissal memory - used wherever the composer's
   * text can be replaced out from under the trigger with no onChange of
   * its own (send, resend-for-edit, blur - see SPEC-TYPEAHEAD.md section 3
   * "DISMISSAL"). */
  reset: () => void;
  /**
   * Apply a selection to `text`: the highlighted match by default, or
   * `explicitCode` for a direct click on a non-highlighted option. Returns
   * null when there is nothing open to select (defensive - callers only
   * invoke this from paths already gated on `matches.length > 0`).
   * Resets trigger state as a side effect, the same as `reset()`.
   */
  select: (text: string, explicitCode?: string) => InstitutionSelectionOutcome | null;
}

const CLOSED_STATE: InstitutionTriggerState = {
  open: false,
  query: "",
  start: 0,
  matches: [],
  highlightIndex: 0,
  institutionsEmpty: false,
  liveMessage: "",
};

function pluralize(count: number): string {
  return `${count} institution${count === 1 ? "" : "s"} available.`;
}

export function useInstitutionTrigger({
  enabled,
  institutions,
  activeInstitution,
}: UseInstitutionTriggerArgs): UseInstitutionTriggerResult {
  const [state, setStateRaw] = useState<InstitutionTriggerState>(CLOSED_STATE);
  const stateRef = useRef<InstitutionTriggerState>(CLOSED_STATE);
  // Token dismissed by Escape (null when nothing is suppressed). Suppression
  // lifts the instant the live query no longer extends this string.
  const dismissedTokenRef = useRef<string | null>(null);
  // The last "shape" the live region announced, so a re-render with the same
  // shape (e.g. still zero matches after another non-matching keystroke)
  // never re-announces the same sentence (SPEC-TYPEAHEAD.md section 9: "never
  // on every keystroke").
  const announcedShapeRef = useRef<TriggerShape>("closed");

  const setState = useCallback((next: InstitutionTriggerState) => {
    stateRef.current = next;
    setStateRaw(next);
  }, []);

  const close = useCallback(() => {
    announcedShapeRef.current = "closed";
    if (stateRef.current !== CLOSED_STATE) setState(CLOSED_STATE);
  }, [setState]);

  const recompute = useCallback(
    (text: string, caret: number) => {
      if (!enabled) return;

      const parsed = parseInstitutionTrigger(text, caret);
      if (!parsed) {
        dismissedTokenRef.current = null;
        close();
        return;
      }

      const { start, query } = parsed;

      if (dismissedTokenRef.current !== null) {
        if (query.startsWith(dismissedTokenRef.current)) {
          close();
          return;
        }
        // The token diverged from what was dismissed - the guard lifts.
        dismissedTokenRef.current = null;
      }

      const institutionsEmpty = institutions.length === 0;
      const matches = institutionsEmpty ? [] : filterInstitutions(orderInstitutions(institutions, activeInstitution), query);
      const shape: TriggerShape = institutionsEmpty ? "empty" : matches.length === 0 ? "no-match" : "matches";
      const transitioned = announcedShapeRef.current !== shape;

      let liveMessage = stateRef.current.liveMessage;
      if (shape === "empty") {
        if (transitioned) liveMessage = "No institutions yet. Add one in Settings.";
      } else if (shape === "no-match") {
        if (transitioned) liveMessage = "No institutions match.";
      } else if (transitioned || matches.length !== stateRef.current.matches.length) {
        liveMessage = pluralize(matches.length);
      }
      announcedShapeRef.current = shape;

      setState({
        open: true,
        query,
        start,
        matches,
        // Filtering already re-sorts the best candidate to the front
        // (orderInstitutions hoists `active`, filterInstitutions preserves
        // order) - resetting to 0 on every keystroke keeps the highlight on
        // that best candidate rather than an index that may no longer exist
        // once the list has narrowed.
        highlightIndex: 0,
        institutionsEmpty,
        liveMessage,
      });
    },
    [enabled, institutions, activeInstitution, close, setState]
  );

  const moveHighlight = useCallback(
    (delta: number) => {
      const current = stateRef.current;
      if (!current.open || current.matches.length === 0) return;
      setState({
        ...current,
        highlightIndex: nextHighlightIndex(current.highlightIndex, current.matches.length, delta),
      });
    },
    [setState]
  );

  const dismiss = useCallback(() => {
    const current = stateRef.current;
    if (!current.open) return;
    dismissedTokenRef.current = current.query;
    close();
  }, [close]);

  const reset = useCallback(() => {
    dismissedTokenRef.current = null;
    close();
  }, [close]);

  const select = useCallback(
    (text: string, explicitCode?: string): InstitutionSelectionOutcome | null => {
      const current = stateRef.current;
      if (!current.open || current.matches.length === 0) return null;
      const code = explicitCode ?? current.matches[current.highlightIndex] ?? current.matches[0];
      const tokenEnd = current.start + 1 + current.query.length;
      const spliced = applyInstitutionSelection(text, current.start, tokenEnd);
      dismissedTokenRef.current = null;
      close();
      return { text: spliced.text, caret: spliced.caret, code };
    },
    [close]
  );

  return { ...state, recompute, moveHighlight, dismiss, reset, select };
}
