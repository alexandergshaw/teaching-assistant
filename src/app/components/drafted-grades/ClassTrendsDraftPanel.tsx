"use client";

import { useState } from "react";
import { Button } from "@mui/material";
import styles from "../../page.module.css";
import controls from "../recording/RecordingControls.module.css";
import { composeClassTrendsDraft } from "@/lib/grade/class-trends-draft";
import type { ClassTrendsReport } from "@/lib/grade/class-trends";
import type { ClassTrendsInsightObservation } from "@/lib/grade/class-trends-insight";
import { nextDraftUiState } from "./classTrendsDraftState";
import type { DraftUiState } from "./classTrendsDraftState";
import { writeClipboardText } from "../ui/clipboard";
import { markdownToHtml } from "@/lib/markdown";

// Backlog N11, layer C: a COPYABLE - explicitly NOT postable - draft message
// addressed to students, composed from layer A's counted trends
// (src/lib/grade/class-trends.ts) and layer B's optional inferred reading
// (src/lib/grade/class-trends-insight.ts). This panel never posts anything
// to Canvas or anywhere else, imports nothing under app/actions, lib/canvas*,
// or lib/lms-generation (enforced by classTrendsDraft.not-postable.test.ts),
// and never calls fetch itself - composeClassTrendsDraft is pure and
// synchronous, so this component's only asynchronous action is the
// clipboard write.
//
// The exact user-facing string on a failed copy is reused verbatim from
// useAnnouncementDraftSlots.ts:376-381, this repo's existing clipboard
// precedent, rather than reworded here.
const COPY_ERROR_MESSAGE =
  "Could not copy - your browser blocked clipboard access. Copy the text manually instead.";

export default function ClassTrendsDraftPanel({
  report,
  observations,
  assignmentName,
}: {
  report: ClassTrendsReport;
  observations: readonly ClassTrendsInsightObservation[];
  assignmentName: string;
}) {
  const [state, setState] = useState<DraftUiState>({ status: "idle" });

  const handleDraft = () => {
    // composeClassTrendsDraft does no I/O and cannot time out - no loading
    // state is rendered, because a spinner for an instant, in-memory
    // function call would misrepresent what is happening.
    const result = composeClassTrendsDraft(report, observations, assignmentName);
    setState((current) => nextDraftUiState(current, { type: "composed", result }));
  };

  const handleCopy = (markdown: string) => {
    // The SAME markdown string backs both clipboard flavours - layer C's
    // draft has no separate title field the way the walkthrough
    // announcement precedent does, so there is no hand-rolled HTML to build
    // here beyond markdownToHtml's own escaping.
    writeClipboardText(markdown, markdownToHtml(markdown)).then(
      () => setState((current) => nextDraftUiState(current, { type: "copy-settled", ok: true })),
      () => setState((current) => nextDraftUiState(current, { type: "copy-settled", ok: false }))
    );
  };

  return (
    <div style={{ marginTop: "var(--space-2)" }}>
      <div className={styles.fieldHint} style={{ margin: "0 0 var(--space-1)", fontWeight: 600 }}>
        A draft message for students - copyable, never posted automatically
      </div>

      {state.status === "idle" && (
        <Button size="small" variant="outlined" onClick={handleDraft}>
          Draft a message
        </Button>
      )}

      {state.status === "below-floor" && (
        <span className={styles.fieldHint}>
          A draft needs at least {state.floor} graded submissions; you have {state.totalResults} so far.
        </span>
      )}

      {/* Amendment 3: no body clause was produced - no area was fully
          covered and classified high/low, and no inferred observation
          survived. The explanation renders; the copy control is withheld
          entirely, because a copy control beside a message with no
          information in it still implies there is something worth sending. */}
      {state.status === "empty" && (
        <span className={styles.fieldHint}>
          No specific pattern has stood out yet across these submissions graded so far - there is nothing to draft
          yet.
        </span>
      )}

      {state.status === "rejected" && (
        <span className={styles.fieldHint}>Could not prepare a draft. Try again.</span>
      )}

      {state.status === "ready" && (
        <div>
          <div
            className={controls.draftPreview}
            dangerouslySetInnerHTML={{ __html: markdownToHtml(state.markdown) }}
          />
          <Button
            size="small"
            variant="outlined"
            onClick={() => handleCopy(state.markdown)}
            style={{ marginTop: "var(--space-1)" }}
          >
            Copy
          </Button>
          {state.copy === "copied" && (
            <p role="status" aria-live="polite" className={styles.fieldHint}>
              Copied.
            </p>
          )}
          {state.copy === "error" && (
            <div role="alert" className={styles.error}>
              {COPY_ERROR_MESSAGE}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
