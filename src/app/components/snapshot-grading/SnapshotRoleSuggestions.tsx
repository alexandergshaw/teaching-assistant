"use client";

// Snapshot grading, N1 (suggest-and-confirm shot roles - Ruling H1-E). A
// CHILD COMPONENT, not new surface in SnapshotGradingPanel.tsx (item 9):
// that panel is 921 lines against the repo-wide 1000-line ceiling
// (src/file-size-ceiling.structure.test.ts) and is not allow-listed.
//
// AC-5/item 8: a suggestion is rendered here, in its OWN box, never as a
// tray tile - so an instructor can never mistake "the model's guess" for
// "what I set" the way an in-tray badge risks being glanced past. AC-8/item
// 7: each suggestion shows its basis (the transcript fragment it came from),
// never a bare role label - the whole risk of this item is a confident
// wrong answer being waved into the score via a one-click bulk accept, and
// showing no evidence would make that click uninformed.

import { SNAPSHOT_ROLE_LABELS } from "./snapshot-shot";
import type { PendingRoleSuggestion } from "./snapshot-role-suggestion";
import styles from "../../page.module.css";
import tray from "./SnapshotGrading.module.css";

export interface SnapshotRoleSuggestionsProps {
  suggestions: readonly PendingRoleSuggestion[];
  onAcceptAll: () => void;
}

export default function SnapshotRoleSuggestions({ suggestions, onAcceptAll }: SnapshotRoleSuggestionsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className={tray.suggestionsBox} aria-label="Suggested shot roles, from the read pass">
      <p className={styles.fieldHint}>
        {`The read pass suggests a role for ${suggestions.length} shot${suggestions.length === 1 ? "" : "s"}. Nothing changes until you accept.`}
      </p>
      <ul className={tray.suggestionsList}>
        {suggestions.map((s) => (
          <li key={s.shotId} className={tray.suggestionItem}>
            <span className={tray.suggestionRole}>{`Suggested: ${SNAPSHOT_ROLE_LABELS[s.suggestedRole]}`}</span>
            <span className={tray.suggestionBasis}>{s.basis}</span>
          </li>
        ))}
      </ul>
      <button type="button" className={tray.roleChoice} onClick={onAcceptAll}>
        {`Accept all ${suggestions.length} suggested role${suggestions.length === 1 ? "" : "s"}`}
      </button>
    </div>
  );
}
