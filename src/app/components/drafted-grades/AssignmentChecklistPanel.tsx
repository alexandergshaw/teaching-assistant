"use client";

import { useState } from "react";
import { Button } from "@mui/material";
import styles from "../../page.module.css";
import { deriveAssignmentChecklistAction, fetchCanvasMetaAction } from "../../actions";
import type { GradingRunEntry } from "@/lib/grade";
import {
  hasRenderableChecklist,
  resolveFallbackChecklistInput,
  type AssignmentChecklistSection,
} from "@/lib/grading-draft-checklist";

type DeriveState = { status: "idle" } | { status: "loading" } | { status: "error"; error: string };

/**
 * Per-assignment full-credit checklist, rendered once per assignment group
 * (never once per student) alongside the drafted grades for that assignment.
 * The Canvas LLM grading path already derives and persists this onto the run
 * (synthesizeFullCreditChecklist in src/lib/grade/rubric.ts) - this panel
 * mostly just displays it, compact and collapsed by default so it never
 * pushes the actual grade rows off screen.
 *
 * For drafts that predate the checklist field, or that came from a grading
 * path that never derives one (the zip upload and embedded engine paths),
 * an instructor can derive it here on demand via an explicit button -
 * nothing here calls the LLM automatically on render. A successful
 * derivation is reported back to the parent (onChecklistDerived), which
 * persists it onto the draft so reopening this page never re-derives it.
 */
export default function AssignmentChecklistPanel({
  section,
  entry,
  onChecklistDerived,
}: {
  section: AssignmentChecklistSection;
  entry: GradingRunEntry;
  onChecklistDerived: (items: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState<DeriveState>({ status: "idle" });

  const derive = async () => {
    setState({ status: "loading" });
    try {
      let instructions = "";
      let rubric = "";

      if (entry.canvasUrl) {
        const meta = await fetchCanvasMetaAction(entry.canvasUrl);
        if (!("error" in meta) && meta.description.trim()) {
          instructions = meta.description;
          rubric = meta.rubricText || entry.run.rubricAreaNames.join("\n");
        }
      }

      if (!instructions) {
        const fallback = resolveFallbackChecklistInput(entry);
        if (!fallback) {
          setState({
            status: "error",
            error: "Not enough information is saved with this draft to derive a checklist.",
          });
          return;
        }
        instructions = fallback.instructions;
        rubric = fallback.rubric;
      }

      const res = await deriveAssignmentChecklistAction(instructions, rubric);
      if ("error" in res) {
        setState({ status: "error", error: res.error });
        return;
      }
      setState({ status: "idle" });
      setExpanded(true);
      onChecklistDerived(res.items);
    } catch (err) {
      setState({
        status: "error",
        error: err instanceof Error ? err.message : "Could not derive a checklist.",
      });
    }
  };

  if (!hasRenderableChecklist(section.checklist)) {
    return (
      <div style={{ padding: "4px 16px 10px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Button size="small" variant="outlined" onClick={() => void derive()} disabled={state.status === "loading"}>
          {state.status === "loading" ? "Deriving checklist..." : "Derive full-credit checklist"}
        </Button>
        <span
          className={styles.fieldHint}
          style={state.status === "error" ? { margin: 0, color: "var(--error-color)" } : { margin: 0 }}
        >
          {state.status === "error" ? state.error : "No full-credit checklist saved for this assignment yet."}
        </span>
      </div>
    );
  }

  return (
    <div style={{ padding: "4px 16px 10px" }}>
      <Button size="small" variant="text" onClick={() => setExpanded((v) => !v)} style={{ marginLeft: -8 }}>
        {expanded ? "Hide full-credit checklist" : "Show full-credit checklist"}
      </Button>
      {expanded && (
        <div className={styles.draftExpand} style={{ marginTop: 4 }}>
          <div className={styles.fieldHint} style={{ margin: 0 }}>
            For full credit, a submission should:
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
            {section.checklist.map((item, idx) => (
              <li key={idx} className={styles.draftFeedback} style={{ margin: 0 }}>
                {item}
              </li>
            ))}
          </ul>
          {section.sampleAnswer && (
            <>
              <div className={styles.fieldHint} style={{ margin: "6px 0 0" }}>
                Sample full-credit answer
              </div>
              <p className={styles.draftFeedback}>{section.sampleAnswer}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
