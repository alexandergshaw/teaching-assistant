"use client";

// WAVE 3 of the assessment-grading extraction. A MOVE of
// grading-recording/GradingTableRow.tsx's own STATE_BADGE map and the two
// badge spans it renders (the state badge and the conditional "Yours"
// badge). The BEHAVIOUR is lifted verbatim.
//
// What stayed behind, and why: the class-list-match badge (NAME_MATCH_BADGE
// at GradingTableRow.tsx:87-92) is per-surface matching semantics, not row
// state, and docs/REGRESSION.md entry 411 is explicit that it must not
// reach this directory. The per-row error line (row.error) also stays behind - it is
// not part of this component's two-prop signature and rendering it here
// would require threading a field this badge has no other use for.

import styles from "../../page.module.css";
import rowStyles from "../grading-recording/GradingTable.module.css";
import type { AssessmentRowState } from "./assessment-row";

const STATE_BADGE: Record<
  AssessmentRowState,
  { label: string; variant: "ghBadgeNeutral" | "ghBadgeWarning" | "ghBadgeSuccess" | "ghBadgeDanger" }
> = {
  pending: { label: "Waiting", variant: "ghBadgeNeutral" },
  grading: { label: "Grading", variant: "ghBadgeWarning" },
  ready: { label: "Ready", variant: "ghBadgeSuccess" },
  failed: { label: "Failed", variant: "ghBadgeDanger" },
};

export interface AssessmentStateBadgeProps {
  state: AssessmentRowState;
  userEdited: boolean;
}

export default function AssessmentStateBadge({ state, userEdited }: AssessmentStateBadgeProps) {
  const stateBadge = STATE_BADGE[state];
  return (
    <>
      <span className={`${styles.ghBadge} ${styles[stateBadge.variant]}`}>{stateBadge.label}</span>
      {userEdited && (
        <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral} ${rowStyles.badgeGap}`}>Yours</span>
      )}
    </>
  );
}
