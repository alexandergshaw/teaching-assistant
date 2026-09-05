"use client";

import styles from "../../page.module.css";

/**
 * The in-window "@institution" popup - see `useInstitutionTrigger` for the
 * state machine this renders, and SPEC-TYPEAHEAD.md section 1 for why this
 * is an in-window absolutely-positioned box (anchored to
 * `.institutionTypeaheadAnchor`, a wrapper `AiChatWindow` places around its
 * composer row) rather than a portalled MUI Popper: the chat window itself
 * is `position: fixed`, draggable, and resizable, which an in-window popup
 * rides along with for free.
 *
 * This component itself carries no "is the popup open" concept - its caller
 * mounts it only while `useInstitutionTrigger`'s `open` is true, so
 * everything rendered here is one of two states: the option list (one or
 * more matches), or a single hint message (no institutions registered at
 * all, or none match the typed query) - never both, and never neither.
 *
 * Imports `page.module.css` directly (rather than receiving class names as
 * props) so every class this file uses counts as referenced by the CSS
 * Module orphan-class ratchet (`courses/page-module-css-orphan-classes.test.ts`,
 * an EQUALITY assertion) - a props-based indirection would orphan all of
 * them, since that scan only credits a class to a file that itself literally
 * writes `styles.<name>`.
 */
export interface InstitutionTypeaheadProps {
  /** Text typed after "@" - only used to interpolate the zero-match hint. */
  query: string;
  /** Ordered, filtered institution codes. Empty renders a hint instead of
   * the listbox (see `institutionsEmpty` for which hint). */
  matches: string[];
  /** Index into `matches` that is currently highlighted. */
  highlightIndex: number;
  /** True when the caller has no institutions registered at all, as
   * opposed to the query simply not matching any of them - these get
   * different hint text (SPEC-TYPEAHEAD.md section 9, items 1-2). */
  institutionsEmpty: boolean;
  /** The institution currently loaded into the chat's context, if any -
   * shown as a "Loaded" tag on its row. */
  loadedInstitution: string | null;
  /** The institution hoisted to the front of `matches` (see
   * `orderInstitutions`) - shown as an "Active" tag on its row, unless that
   * row already carries "Loaded". */
  activeInstitution: string;
  /** id of the rendered `<ul>` - must match the composer's
   * `aria-controls`. Only used while `matches.length > 0`. */
  listboxId: string;
  /** Stable id for the option at `index` - must match however the composer
   * computes `aria-activedescendant`. */
  getOptionId: (index: number) => string;
  /** Fired when an option is activated by click, with that option's code -
   * never fired for a highlight-only hover/keyboard move. */
  onOptionActivate: (code: string) => void;
}

export default function InstitutionTypeahead({
  query,
  matches,
  highlightIndex,
  institutionsEmpty,
  loadedInstitution,
  activeInstitution,
  listboxId,
  getOptionId,
  onOptionActivate,
}: InstitutionTypeaheadProps) {
  const hasMatches = !institutionsEmpty && matches.length > 0;

  return (
    <div className={styles.institutionTypeaheadPopup}>
      {hasMatches && (
        <ul className={styles.institutionTypeaheadList} role="listbox" id={listboxId} aria-label="Institutions">
          {matches.map((code, index) => {
            const meta = loadedInstitution === code ? "Loaded" : activeInstitution === code ? "Active" : null;
            return (
              <li
                key={code}
                id={getOptionId(index)}
                role="option"
                aria-selected={index === highlightIndex}
                className={styles.institutionTypeaheadOption}
                // Options are never focusable (no tabIndex) - the textarea
                // keeps focus throughout, and the highlighted option is
                // conveyed solely via aria-activedescendant. Without
                // preventDefault here, mousedown would blur the textarea
                // before the click fires, losing the caret position
                // applyInstitutionSelection needs to splice the right range.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onOptionActivate(code)}
              >
                <span>{code}</span>
                {meta && <span className={styles.institutionTypeaheadMeta}>{meta}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {/* THE HINT <p> IS A SIBLING OF THE <ul>, NEVER A CHILD - a
          role="listbox" with non-option children is invalid markup, and with
          zero matches there is no <ul> in the DOM at all. */}
      {!hasMatches && (
        <p className={styles.institutionTypeaheadHint}>
          {institutionsEmpty ? (
            <>No institutions yet. Add one in Settings (top right).</>
          ) : (
            <>No institutions match &ldquo;{query}&rdquo;.</>
          )}
        </p>
      )}
    </div>
  );
}
