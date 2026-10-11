import type { SubmissionZipClassification } from "@/lib/grade/types";
import styles from "../../page.module.css";

// ZIP-CLASS-VS-SINGLE W1: one quiet line stating what the latest zip upload
// looked like (a whole-class bundle, one submission, or undetermined). Pure
// render of a single run value; renders nothing when no zip was ingested.
function describe(classification: SubmissionZipClassification): string {
  switch (classification.kind) {
    case "class":
      return `Class bundle - ${classification.studentCount} students`;
    case "single":
      return "Single submission";
    case "unknown":
      return classification.signal === "ambiguous"
        ? "Could not determine whether this zip is one student or a class (several loose files)"
        : "Could not determine whether this zip is one student or a class";
  }
}

export default function SubmissionClassificationBadge({
  classification,
}: {
  classification: SubmissionZipClassification | undefined;
}) {
  if (!classification) return null;
  return (
    <p className={styles.ghMeta} role="status" data-zip-kind={classification.kind}>
      Latest zip upload: {describe(classification)}
    </p>
  );
}
