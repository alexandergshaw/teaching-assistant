"use client";

// DEFECT 3 split - the run-input table itself: the sticky click-to-sort
// `thead`, editable cells, the per-row selection checkbox, and the per-row
// detail expander (fetch + open/close, delegated to RunInputRowDetail.tsx
// for its actual rendering). Extracted out of RunInputPrompt.tsx's
// ~585-line `table` branch (MECHANICAL only, no behavior change) - mirrors
// the RuntimeFieldInput.tsx family split. RunInputTableSection.tsx is the
// only caller.
//
// This is where every mutation to the consolidated PromptState (DEFECT 4)
// that the table view needs actually happens - checked toggling, cell
// edits, sort, frozen order, detail fetch/open/close, and the code-run
// action - all via the SAME `setState` functional updater RunInputPrompt.tsx
// passes down, exactly the way RuntimeFieldInputUploads already threads a
// single `setFiles` updater through RuntimeFieldInput's own sibling split.
import { Fragment, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { TextField, Checkbox } from "@mui/material";
import { runSubmissionCodeAction } from "@/app/actions";
import type { TableRowDetail } from "@/lib/workflows/registry";
import type { VisibleTableRow } from "../run-input-table-stats";
import type { PromptState } from "./run-input-prompt-state";
import type { RunInputColumn } from "./run-input-types";
import { RunInputRowDetail } from "./RunInputRowDetail";
import { describeRunInputRow } from "./run-input-row-label";
import styles from "../../../page.module.css";

export interface RunInputTableProps {
  columns: RunInputColumn[];
  selectable?: boolean;
  rowDetail?: (row: Record<string, string>) => Promise<TableRowDetail>;
  tableDisplay: VisibleTableRow[];
  state: PromptState;
  setState: Dispatch<SetStateAction<PromptState>>;
  tableHasGrade: boolean;
  tableGradeIssue: (row: Record<string, string>) => string | null;
  initialRows: Array<Record<string, string>>;
  GradeBadge: (props: { row: Record<string, string> }) => ReactNode;
  DetailSectionsView: (props: { text: string }) => ReactNode;
}

export function RunInputTable({
  columns,
  selectable,
  rowDetail,
  tableDisplay,
  state,
  setState,
  tableHasGrade,
  tableGradeIssue,
  initialRows,
  GradeBadge,
  DetailSectionsView,
}: RunInputTableProps) {
  const { checked, sort, details } = state;
  const hasDetail = rowDetail !== undefined;

  return (
    <div style={{ maxHeight: "min(65vh, 720px)", overflow: "auto", marginTop: 8 }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "0.85rem",
        }}
      >
        <thead>
          <tr>
            {selectable && (
              <th
                scope="col"
                style={{
                  textAlign: "center",
                  borderBottom: "1px solid var(--field-border)",
                  padding: "8px 10px",
                  fontWeight: "bold",
                  width: 32,
                  position: "sticky",
                  top: 0,
                  background: "var(--card-background)",
                  zIndex: 1,
                }}
              >
                <Checkbox
                  size="small"
                  checked={tableDisplay.length > 0 && tableDisplay.every(({ index }) => checked[index] ?? true)}
                  indeterminate={
                    tableDisplay.some(({ index }) => checked[index] ?? true) &&
                    !tableDisplay.every(({ index }) => checked[index] ?? true)
                  }
                  onChange={() => {
                    const allChecked = tableDisplay.every(({ index }) => checked[index] ?? true);
                    const visible = new Set(tableDisplay.map(({ index }) => index));
                    setState((prev) => ({
                      ...prev,
                      checked: prev.checked.map((c, i) => (visible.has(i) ? !allChecked : c)),
                    }));
                  }}
                  slotProps={{ input: { "aria-label": "Select all visible rows" } }}
                />
              </th>
            )}
            {columns.map((col) => {
              const isSorted = sort?.key === col.key;
              const ariaSort: "ascending" | "descending" | "none" = col.link
                ? "none"
                : isSorted
                  ? sort!.dir === "asc"
                    ? "ascending"
                    : "descending"
                  : "none";
              const onSort = () => {
                if (col.link) return;
                setState((prev) => ({
                  ...prev,
                  sort:
                    prev.sort?.key !== col.key
                      ? { key: col.key, dir: "asc" }
                      : prev.sort.dir === "asc"
                        ? { key: col.key, dir: "desc" }
                        : null,
                }));
              };
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={ariaSort}
                  style={{
                    textAlign: "left",
                    borderBottom: "1px solid var(--field-border)",
                    padding: "8px 10px",
                    fontWeight: "bold",
                    width: col.width,
                    position: "sticky",
                    top: 0,
                    background: "var(--card-background)",
                    zIndex: 1,
                  }}
                >
                  {col.link ? (
                    col.label
                  ) : (
                    <button
                      type="button"
                      onClick={onSort}
                      title="Sort by this column"
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        font: "inherit",
                        color: "inherit",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      {col.label}
                      {isSorted && (
                        <span style={{ fontSize: "0.7em", color: "var(--hint-text)" }}>
                          {sort!.dir === "asc" ? "(asc)" : "(desc)"}
                        </span>
                      )}
                    </button>
                  )}
                </th>
              );
            })}
            {hasDetail && (
              <th
                scope="col"
                style={{
                  textAlign: "center",
                  borderBottom: "1px solid var(--field-border)",
                  padding: "8px 10px",
                  fontWeight: "bold",
                  width: 80,
                  position: "sticky",
                  top: 0,
                  background: "var(--card-background)",
                  zIndex: 1,
                }}
              >
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {tableDisplay.map(({ row, index: rowIndex }) => {
            const detail = details[rowIndex];
            const colSpan = (selectable ? 1 : 0) + columns.length + (hasDetail ? 1 : 0);
            const initialRow = initialRows[rowIndex];
            const rowDirty =
              initialRow !== undefined &&
              columns.some((c) => c.editable && (row[c.key] ?? "") !== (initialRow[c.key] ?? ""));
            const rowSelected = checked[rowIndex] ?? true;

            const onToggleDetail = async () => {
              if (detail?.open) {
                setState((prev) => ({
                  ...prev,
                  details: { ...prev.details, [rowIndex]: { ...prev.details[rowIndex]!, open: false } },
                }));
              } else if (detail?.status === "done") {
                setState((prev) => ({
                  ...prev,
                  details: { ...prev.details, [rowIndex]: { ...prev.details[rowIndex]!, open: true } },
                }));
              } else {
                setState((prev) => ({
                  ...prev,
                  details: { ...prev.details, [rowIndex]: { open: true, status: "loading", detail: null, error: "" } },
                }));
                try {
                  const result = await rowDetail!(row);
                  setState((prev) => ({
                    ...prev,
                    details: { ...prev.details, [rowIndex]: { open: true, status: "done", detail: result, error: "" } },
                  }));
                } catch (err) {
                  setState((prev) => ({
                    ...prev,
                    details: {
                      ...prev.details,
                      [rowIndex]: {
                        open: true,
                        status: "error",
                        detail: null,
                        error: err instanceof Error ? err.message : "Error loading submission",
                      },
                    },
                  }));
                }
              }
            };

            const onRunCode = async () => {
              setState((prev) => ({
                ...prev,
                details: {
                  ...prev.details,
                  [rowIndex]: { ...prev.details[rowIndex]!, run: { status: "running", result: null } },
                },
              }));
              try {
                const result = await runSubmissionCodeAction(
                  (detail?.detail?.files ?? []).map((f) => ({
                    name: f.name,
                    extension: f.name.includes(".") ? f.name.split(".").pop()!.toLowerCase() : "",
                    rawBase64: f.base64,
                  }))
                );
                setState((prev) => ({
                  ...prev,
                  details: {
                    ...prev.details,
                    [rowIndex]: { ...prev.details[rowIndex]!, run: { status: "done", result } },
                  },
                }));
              } catch (err) {
                setState((prev) => ({
                  ...prev,
                  details: {
                    ...prev.details,
                    [rowIndex]: {
                      ...prev.details[rowIndex]!,
                      run: {
                        status: "done",
                        result: null,
                        error: err instanceof Error ? err.message : "Run failed.",
                      },
                    },
                  },
                }));
              }
            };

            return (
              <Fragment key={rowIndex}>
                <tr
                  className={`${styles.workflowTableRow} ${
                    selectable
                      ? rowSelected
                        ? styles.workflowTableRowSelected
                        : styles.workflowTableRowUnselected
                      : ""
                  }`}
                >
                  {selectable && (
                    <td
                      style={{
                        borderBottom: "1px solid var(--field-border)",
                        padding: "8px 10px",
                        textAlign: "center",
                      }}
                    >
                      <Checkbox
                        size="small"
                        checked={checked[rowIndex] ?? true}
                        onChange={() => {
                          setState((prev) => ({
                            ...prev,
                            checked: prev.checked.map((c, idx) => (idx === rowIndex ? !c : c)),
                          }));
                        }}
                        slotProps={{ input: { "aria-label": `Include ${describeRunInputRow(columns, row, rowIndex)}` } }}
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      style={{
                        borderBottom: "1px solid var(--field-border)",
                        padding: "8px 10px",
                        width: col.width,
                      }}
                    >
                      {col.link ? (
                        row[col.key] ? (
                          <a href={row[col.key]} target="_blank" rel="noreferrer" className={styles.linkButton}>
                            View
                          </a>
                        ) : null
                      ) : col.editable ? (
                        <TextField
                          size="small"
                          fullWidth
                          multiline={col.multiline}
                          minRows={col.multiline ? 2 : 1}
                          value={row[col.key] ?? ""}
                          error={tableHasGrade && col.key === "grade" && tableGradeIssue(row) !== null}
                          sx={
                            initialRow !== undefined && (row[col.key] ?? "") !== (initialRow[col.key] ?? "")
                              ? { "& .MuiInputBase-root": { background: "color-mix(in srgb, var(--accent) 8%, transparent)" } }
                              : undefined
                          }
                          onFocus={() =>
                            setState((prev) => ({
                              ...prev,
                              frozenOrder: prev.frozenOrder ?? tableDisplay.map(({ index }) => index),
                            }))
                          }
                          onBlur={() => setState((prev) => ({ ...prev, frozenOrder: null }))}
                          onChange={(e) => {
                            const newValue = e.target.value;
                            setState((prev) => ({
                              ...prev,
                              rows: prev.rows.map((r, idx) =>
                                idx === rowIndex ? { ...r, [col.key]: newValue } : r
                              ),
                            }));
                          }}
                        />
                      ) : (
                        row[col.key] ?? ""
                      )}
                      {tableHasGrade && col.key === "grade" && (
                        <div style={{ marginTop: 4 }}>
                          <GradeBadge row={row} />
                        </div>
                      )}
                    </td>
                  ))}
                  {hasDetail && (
                    <td
                      style={{
                        borderBottom: "1px solid var(--field-border)",
                        padding: "8px 10px",
                        textAlign: "center",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {rowDirty && (
                        <button
                          className={styles.linkButton}
                          style={{ marginRight: 8 }}
                          title="Restore this row's original values"
                          onClick={() => {
                            setState((prev) => ({
                              ...prev,
                              rows: prev.rows.map((r, idx) => (idx === rowIndex ? { ...initialRows[rowIndex] } : r)),
                            }));
                          }}
                        >
                          Reset
                        </button>
                      )}
                      <button className={styles.linkButton} onClick={onToggleDetail}>
                        {detail?.open ? "Hide" : "Preview"}
                      </button>
                    </td>
                  )}
                </tr>
                {hasDetail && (
                  <RunInputRowDetail
                    colSpan={colSpan}
                    detail={detail}
                    DetailSectionsView={DetailSectionsView}
                    onRunCode={onRunCode}
                  />
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
