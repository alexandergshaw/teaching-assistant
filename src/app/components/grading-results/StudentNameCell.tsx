import styles from "../../page.module.css";
import { describeUnresolvedNameLabel } from "./unresolvedNameLabel";

// Extracted from GradingResults.tsx's student cell (line-budget, F-SIZE-a). Holds
// the name, the ungraded-state label, the opt-in unresolved-name flag, and the
// SpeedGrader link. The Post / Regrade buttons stay in GradingResults.tsx.
export interface StudentNameCellProps {
  readonly student: string;
  /** describeUngradedRowLabel(state), computed by the caller; null for a postable row. */
  readonly ungradedRowLabel: string | null;
  readonly speedGraderHref: string | null;
  /** True only on the chat grading mount, for an unlabelled row whose name was
   * not found. Rendered as text so it does not rely on colour alone. */
  readonly unresolved?: boolean;
}

export function StudentNameCell({ student, ungradedRowLabel, speedGraderHref, unresolved }: StudentNameCellProps) {
  return (
    <>
      <div style={{ fontWeight: 600 }}>{student}</div>
      {unresolved && <div className={styles.ungradedRowLabel}>{describeUnresolvedNameLabel()}</div>}
      {ungradedRowLabel && <div className={styles.ungradedRowLabel}>{ungradedRowLabel}</div>}
      {speedGraderHref && (
        <a
          href={speedGraderHref}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.fieldHint}
          style={{ display: "inline-block", marginTop: "var(--space-1)" }}
        >
          Open in SpeedGrader
        </a>
      )}
    </>
  );
}
