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
 * (never once per student) inline in that group's header row alongside the
 * drafted grades table. The Canvas LLM grading path already derives and
 * persists this onto the run (synthesizeFullCreditChecklist in
 * src/lib/grade/rubric.ts) - this panel mostly just displays it, as a single
 * inline toggle so it never adds height to the group header unless the
 * instructor opens it. When open, the checklist body renders full-width
 * (flexBasis: 100%) so it wraps onto its own line below the header's flex
 * row rather than squeezing the title and student-count chip.
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
      <>
        <Button size="small" variant="text" onClick={() => void derive()} disabled={state.status === "loading"} style={{ minWidth: 0 }}>
          {state.status === "loading" ? "Deriving checklist…" : "Derive checklist"}
        </Button>
        {state.status === "error" && (
          <span className={styles.fieldHint} style={{ margin: 0, color: "var(--danger)", flexBasis: "100%" }}>
            {state.error}
          </span>
        )}
      </>
    );
  }

  return (
    <>
      <Button size="small" variant="text" onClick={() => setExpanded((v) => !v)} style={{ minWidth: 0 }}>
        {expanded ? "Hide checklist" : `Checklist (${section.checklist.length})`}
      </Button>
      {expanded && (
        <div className={styles.draftExpand} style={{ flexBasis: "100%", marginTop: "var(--space-1)" }}>
          <div className={styles.fieldHint} style={{ margin: 0 }}>
            For full credit, a submission should:
          </div>
          <ul style={{ margin: 0, paddingLeft: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            {section.checklist.map((item, idx) => (
              <li key={idx} className={styles.draftFeedback} style={{ margin: 0 }}>
                {item}
              </li>
            ))}
          </ul>
          {section.sampleAnswer && (
            <>
              <div className={styles.fieldHint} style={{ margin: "var(--space-1) 0 0" }}>
                Sample full-credit answer
              </div>
              <p className={styles.draftFeedback}>{section.sampleAnswer}</p>
            </>
          )}
        </div>
      )}
    </>
  );
}
