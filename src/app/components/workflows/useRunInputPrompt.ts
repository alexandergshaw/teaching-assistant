"use client";

import { useRef, useState } from "react";
import type { TableRowDetail } from "@/lib/workflows/registry";

/**
 * The active "requireInput" prompt shown mid-run - useWorkflowRun.ts's
 * handleRun awaits a promise that this prompt's resolver settles, and
 * populates it with whatever a step's requireInput asked for. Null when no
 * step is currently asking the user for input.
 */
export type RunInputValue = {
  groupIndex: number;
  stepIndex: number;
  message: string;
  kind: "text" | "choice" | "upload" | "workflow" | "table";
  options: Array<{ value: string; label: string }>;
  optional: boolean;
  initialValue?: string;
  submitLabel?: string;
  regenerate?: () => Promise<string>;
  columns?: Array<{ key: string; label: string; editable?: boolean; multiline?: boolean; link?: boolean; width?: number }>;
  selectable?: boolean;
  rowDetail?: (row: Record<string, string>) => Promise<TableRowDetail>;
  transform?: (value: string | File[] | Array<Record<string, string>>) => unknown;
};

/**
 * Owns the run-input prompt's state (the modal/table shown when a step's
 * requireInput pauses handleRun) and the promise-resolver plumbing handleRun
 * awaits when a step requires input. Extracted out of useWorkflowRun.ts as
 * its own hook so that file stays under this project's line cap.
 *
 * This is a mechanical relocation of the same useState/useRef calls
 * useWorkflowRun.ts used to make inline, in the same relative order - React's
 * rules of hooks only require that the SAME hooks be called in the SAME
 * order on every render, which calling them from inside this nested hook
 * still satisfies (the call sequence for the owning component is unchanged).
 *
 * The returned surface (every field name below) is exactly what
 * useWorkflowRun.ts's handleRun and its UseWorkflowRunReturn already used
 * under these names, so neither had to change shape.
 *
 * This hook used to also own a text/choice/files/rows/checked/busy/error/
 * details octet plus a search/sort/frozen-order trio - eleven useState calls
 * whose values were either discarded at the declaration (`const [,
 * setX] = useState(...)`) or never read by any consumer. RunInputPrompt.tsx
 * keeps its own copy of every one of those (its actual, live state) and
 * re-does the identical reset in its own effect, so nothing anywhere ever
 * read this hook's copies - confirmed by grepping the whole of src/ (see
 * this repo's DEFECT 1 fix). They were removed; only runInputInitialRows
 * survived that cut, because WorkflowPanel.tsx genuinely reads it (as
 * initialRunInputRows) and hands it down to RunInputPrompt's `initialRows`
 * prop.
 */
export function useRunInputPrompt() {
  const [runInput, setRunInput] = useState<RunInputValue | null>(null);
  const inputResolverRef = useRef<{ resolve: (value: string | File[] | Array<Record<string, string>> | null) => void } | null>(null);
  const [runInputInitialRows, setRunInputInitialRows] = useState<Array<Record<string, string>>>([]);

  const tableHasGrade =
    runInput?.kind === "table" && (runInput.columns ?? []).some((c) => c.key === "grade");

  return {
    runInput,
    setRunInput,
    inputResolverRef,
    runInputInitialRows,
    setRunInputInitialRows,
    tableHasGrade,
  };
}
