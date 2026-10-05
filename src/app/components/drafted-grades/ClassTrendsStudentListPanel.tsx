"use client";

import { useState } from "react";
import { Button } from "@mui/material";
import styles from "../../page.module.css";
import { describeUnknownExcluded, type AreaAttribution } from "@/lib/grade/class-trends";
import { writeClipboardText } from "../ui/clipboard";

// N13b Wave 2 (option X): the instructor-only, NAMED counterpart to the
// class-addressed (name-free) subset clause in ClassTrendsDraftPanel. This
// leaf reads report.instructorAttribution - never `.student` - and is a
// canary-3 root in classTrendsDraft.not-postable.test.ts: it must never reach
// a posting or model capability, because names are the exact thing AC-8
// exists to keep out of anything that could be pasted into a class channel.
//
// The exact copy-failure sentence is reused verbatim from
// ClassTrendsDraftPanel.tsx - it describes a browser clipboard permission
// failure, not what was being copied, so the same sentence is correct here
// too.
const COPY_ERROR_MESSAGE =
  "Could not copy - your browser blocked clipboard access. Copy the text manually instead.";

type CopyState = { status: "idle" } | { status: "copied" } | { status: "error" };

/** Plain text, no markdown - the named list has no bold/links/lists that need
 * HTML, so this never calls markdownToHtml. */
function buildStudentListText(instructorAttribution: readonly AreaAttribution[]): string {
  return instructorAttribution
    .map((attribution) => {
      const names = attribution.students.map((s) => s.displayName).join(", ");
      return `${attribution.displayArea} - ${attribution.students.length} students missed points: ${names}`;
    })
    .join("\n");
}

/**
 * Requirement (N13b Wave 2, R-UX-1(b)): three distinct states, mirroring the
 * class draft's own "explicit state, not an empty string" idiom - plus a
 * fourth state added for the repo/unavailable case (docs/n13b-architecture.md
 * section 4.1): the subset was never computed there, so it must never be
 * reported as genuinely empty.
 *
 * 1. No areas at all - handled by the CALLER (ClassTrendsPanel), which mounts
 *    this leaf only inside its own non-empty `report.areas.length === 0 ?`
 *    branch, so this component is never rendered for that state at all.
 * 2. Areas exist, but no area cleared the subset threshold
 *    (`instructorAttribution.length === 0`): a hint line, no heading, no Copy
 *    button - a heading or a button next to nothing implies there is
 *    something to act on when there is not.
 * 3. At least one area cleared the threshold: heading, per-area lines, Copy
 *    button.
 * 4. `unavailableReason` is set (identity is `{kind:"unavailable"}` upstream,
 *    e.g. the repo surface, option X): the subset was never computed at all,
 *    so this state SURFACES the reason instead of falling into State 2's
 *    "nothing to contact anyone about" message, which would falsely assert a
 *    genuine, counted emptiness.
 */
export default function ClassTrendsStudentListPanel({
  instructorAttribution,
  unavailableReason,
}: {
  instructorAttribution: readonly AreaAttribution[];
  unavailableReason?: string;
}) {
  const [copyState, setCopyState] = useState<CopyState>({ status: "idle" });

  if (unavailableReason) {
    return (
      <span className={styles.fieldHint} style={{ display: "block", marginTop: "var(--space-2)" }}>
        Per-student trends are not available here: {unavailableReason}
      </span>
    );
  }

  if (instructorAttribution.length === 0) {
    return (
      <span className={styles.fieldHint} style={{ display: "block", marginTop: "var(--space-2)" }}>
        No area yet has three or more students who missed points - nothing to contact anyone about yet.
      </span>
    );
  }

  const handleCopy = () => {
    const text = buildStudentListText(instructorAttribution);
    writeClipboardText(text).then(
      () => setCopyState({ status: "copied" }),
      () => setCopyState({ status: "error" })
    );
  };

  return (
    <div style={{ marginTop: "var(--space-2)" }}>
      <div className={styles.fieldHint} style={{ margin: "0 0 var(--space-1)", fontWeight: 600 }}>
        Students to contact - instructor only, never post this to the class
      </div>
      <ul
        style={{ margin: 0, paddingLeft: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}
      >
        {instructorAttribution.map((attribution) => (
          <li key={attribution.area} className={styles.draftFeedback} style={{ margin: 0 }}>
            {attribution.displayArea} - {attribution.students.length} students missed points:{" "}
            {attribution.students.map((s) => s.displayName).join(", ")}
            {describeUnknownExcluded(attribution.unknownExcludedCount) !== null && (
              <span className={styles.fieldHint}> ({describeUnknownExcluded(attribution.unknownExcludedCount)})</span>
            )}
          </li>
        ))}
      </ul>
      <Button size="small" variant="outlined" onClick={handleCopy} style={{ marginTop: "var(--space-1)" }}>
        Copy student list
      </Button>
      {copyState.status === "copied" && (
        <p role="status" aria-live="polite" className={styles.fieldHint}>
          Copied.
        </p>
      )}
      {copyState.status === "error" && (
        <div role="alert" className={styles.error}>
          {COPY_ERROR_MESSAGE}
        </div>
      )}
    </div>
  );
}
