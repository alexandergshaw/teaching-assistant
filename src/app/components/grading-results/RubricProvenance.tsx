// A39 wave 2 (docs/owner-decisions-2026-09-23.md DECISION 3, docs/a39-
// architecture.md 6.4): the version-provenance half of the leverage claim. A
// chat can persist a rubric too; what a chat cannot do is say WHICH version
// of a rubric graded a given run. Mounted by GradingTab.tsx above its
// <GradingResults mount (never by GradingResults.tsx itself), because it
// reads the RUN, not any surface's own rubric field. Pure presentation: all
// the reading happens in rubricProvenance.ts (W2-3's removal test lives
// there, not here).
import { describeRunRubricProvenance } from "@/lib/grade/rubricProvenance";
import type { GradingRun } from "@/lib/grade/types";
import styles from "../../page.module.css";

export default function RubricProvenance({ run }: { run: GradingRun }) {
  const line = describeRunRubricProvenance(run);
  if (!line) return null;
  // W2-8: the one required spelling is set here, in the JSX itself, so the
  // source-text instrument that reads this file (rubricProvenanceLeaf.test.ts)
  // finds it without rendering anything. See that test for the rejected
  // alternatives this must never say instead.
  return <p className={styles.fieldHint}>Rubric used: {line}</p>;
}
