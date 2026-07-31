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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RunInputDetailsMap = Record<number, { open: boolean; status: "loading" | "done" | "error"; detail: TableRowDetail | null; error: string; run?: { status: "running" | "done"; result: any; error?: string } }>;

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
 */
export function useRunInputPrompt() {
  const [runInput, setRunInput] = useState<RunInputValue | null>(null);
  const inputResolverRef = useRef<{ resolve: (value: string | File[] | Array<Record<string, string>> | null) => void } | null>(null);
  const [, setRunInputText] = useState("");
  const [, setRunInputChoice] = useState("");
  const [, setRunInputFiles] = useState<File[]>([]);
  const [, setRunInputRows] = useState<Array<Record<string, string>>>([]);
  const [, setRunInputChecked] = useState<boolean[]>([]);
  const [, setRunInputBusy] = useState(false);
  const [, setRunInputError] = useState<string | null>(null);
  const [, setRunInputDetails] = useState<RunInputDetailsMap>({});
  const [runInputSearch, setRunInputSearch] = useState("");
  const [runInputSort, setRunInputSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [runInputInitialRows, setRunInputInitialRows] = useState<Array<Record<string, string>>>([]);
  const [tableFrozenOrder, setTableFrozenOrder] = useState<number[] | null>(null);

  const tableHasGrade =
    runInput?.kind === "table" && (runInput.columns ?? []).some((c) => c.key === "grade");

  return {
    runInput,
    setRunInput,
    inputResolverRef,
    setRunInputText,
    setRunInputChoice,
    setRunInputFiles,
    setRunInputRows,
    setRunInputChecked,
    setRunInputBusy,
    setRunInputError,
    setRunInputDetails,
    runInputSearch,
    setRunInputSearch,
    runInputSort,
    setRunInputSort,
    runInputInitialRows,
    setRunInputInitialRows,
    tableFrozenOrder,
    setTableFrozenOrder,
    tableHasGrade,
  };
}
