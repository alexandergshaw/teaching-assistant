"use client";

// DEFECT 3 split - the run-input `table` branch's top-level container: owns
// the three derived-data useMemo calls (visible rows, grade stats, grade
// distribution - all delegated to run-input-table-stats.ts, unchanged) and
// composes the toolbar and the table itself. Extracted out of
// RunInputPrompt.tsx (MECHANICAL only, no behavior change) - mirrors the
// RuntimeFieldInput.tsx family split. RunInputPrompt.tsx (the entry point)
// is the only caller.
import { useMemo, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { TableRowDetail } from "@/lib/workflows/registry";
import { computeVisibleTableRows, computeGradeStats, computeGradeDistribution } from "../run-input-table-stats";
import type { PromptState } from "./run-input-prompt-state";
import type { RunInputColumn } from "./run-input-types";
import { RunInputTableToolbar } from "./RunInputTableToolbar";
import { RunInputTable } from "./RunInputTable";

export interface RunInputTableSectionProps {
  columns: RunInputColumn[];
  selectable?: boolean;
  rowDetail?: (row: Record<string, string>) => Promise<TableRowDetail>;
  state: PromptState;
  setState: Dispatch<SetStateAction<PromptState>>;
  tableHasGrade: boolean;
  tableGradeIssue: (row: Record<string, string>) => string | null;
  csvCell: (value: string) => string;
  initialRows: Array<Record<string, string>>;
  GradeBadge: (props: { row: Record<string, string> }) => ReactNode;
  DetailSectionsView: (props: { text: string }) => ReactNode;
}

export function RunInputTableSection({
  columns,
  selectable,
  rowDetail,
  state,
  setState,
  tableHasGrade,
  tableGradeIssue,
  csvCell,
  initialRows,
  GradeBadge,
  DetailSectionsView,
}: RunInputTableSectionProps) {
  const { rows, search, sort, frozenOrder, checked } = state;

  // The display list: original indices ride along so selection, details, and
  // edits stay keyed to the underlying rows while the view filters/sorts.
  const tableDisplay = useMemo(
    () => computeVisibleTableRows({ kind: "table", columns }, rows, search, sort, frozenOrder),
    [columns, rows, search, sort, frozenOrder]
  );

  const tableGradeStats = useMemo(() => computeGradeStats(tableHasGrade, rows), [tableHasGrade, rows]);

  const tableGradeDist = useMemo(() => computeGradeDistribution(tableHasGrade, rows), [tableHasGrade, rows]);

  return (
    <>
      <RunInputTableToolbar
        tableHasGrade={tableHasGrade}
        columns={columns}
        selectable={selectable}
        search={search}
        onSearchChange={(value) => setState((prev) => ({ ...prev, search: value }))}
        tableGradeStats={tableGradeStats}
        tableGradeDist={tableGradeDist}
        rows={rows}
        tableDisplay={tableDisplay}
        checked={checked}
        onUncheckInvalid={() =>
          setState((prev) => ({
            ...prev,
            checked: prev.checked.map((c, i) => (tableGradeIssue(prev.rows[i] ?? {}) ? false : c)),
          }))
        }
        csvCell={csvCell}
      />
      <RunInputTable
        columns={columns}
        selectable={selectable}
        rowDetail={rowDetail}
        tableDisplay={tableDisplay}
        state={state}
        setState={setState}
        tableHasGrade={tableHasGrade}
        tableGradeIssue={tableGradeIssue}
        initialRows={initialRows}
        GradeBadge={GradeBadge}
        DetailSectionsView={DetailSectionsView}
      />
    </>
  );
}
