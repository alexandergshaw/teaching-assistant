"use client";

import IconButton from "@mui/material/IconButton";
import ClassTrendsPanel from "../drafted-grades/ClassTrendsPanel";
import { hasTrendableResults, toClassTrendsEntry } from "./classTrendsEntry";
import { CopyIcon } from "./icons";
import type { GradingRun } from "./gradingResultsHelpers";
import styles from "../../page.module.css";
import layout from "./results-layout.module.css";

type Props = {
  run: GradingRun;
  assignmentName: string;
  canvasUrl: string;
  copiedKey: string | null;
  onCopy: (key: string, value: string) => Promise<void>;
  compactContext?: boolean;
};

export function GradingResultsContext({ run, assignmentName, canvasUrl, copiedKey, onCopy, compactContext }: Props) {
  const content = <>
      {run.fullCreditChecklist && run.fullCreditChecklist.length > 0 && (
        <section className={styles.resultsChecklist}>
          <h3>What earns full credit</h3>
          <ul>
            {run.fullCreditChecklist.map((item, index) => (
              <li key={`full-credit-${index + 1}`}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {run.sampleAnswer && run.sampleAnswer.trim() && (
        <section className={styles.resultsChecklist}>
          <div className={layout.actions}>
            <h3 style={{ margin: 0 }}>Sample correct answer</h3>
            <IconButton
              size="small"
              title={copiedKey === "sample-answer" ? "Copied" : "Copy sample answer"}
              aria-label="Copy sample correct answer"
              onClick={() => onCopy("sample-answer", run.sampleAnswer ?? "")}
            >
              <CopyIcon />
            </IconButton>
          </div>
          <div style={{ whiteSpace: "pre-wrap", marginTop: "var(--space-2)" }}>{run.sampleAnswer}</div>
        </section>
      )}

      {(() => {
        // A16-1 (docs/a16-scope.md sections 4.1/4.6): the SAME ClassTrendsPanel
        // Drafted Grades already mounts, reached from every LMS Grading
        // surface through this one component. The adapter passes `run` by
        // REFERENCE (classTrendsEntry.ts's own header comment) - no
        // filtering, reordering or rewriting of any result - and the mount
        // is gated on hasTrendableResults so a run with nothing graded yet
        // renders nothing at all, never a "Trends (0)" button.
        const classTrendsEntry = toClassTrendsEntry(run, { courseName: "", assignmentName, canvasUrl });
        return (
          hasTrendableResults(classTrendsEntry) && (
            <div style={{ margin: "0 0 var(--space-2)" }}>
              <ClassTrendsPanel entry={classTrendsEntry} defaultExpanded />
            </div>
          )
        );
      })()}

  </>;
  return compactContext ? (
    <details className={layout.context}>
      <summary>Grading context</summary>
      {content}
    </details>
  ) : content;
}
