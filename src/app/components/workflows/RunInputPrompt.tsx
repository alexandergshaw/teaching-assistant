"use client";

import React, { useState, useMemo, Fragment, useEffect } from "react";
import { Button, MenuItem, TextField, Checkbox } from "@mui/material";
import { runSubmissionCodeAction } from "@/app/actions";
import type { TableRowDetail } from "@/lib/workflows/registry";
import type { CodeRunResult } from "@/lib/code-runner";
import styles from "../../page.module.css";

type RunInputData = {
  groupIndex: number;
  stepIndex: number;
  message: string;
  kind: "text" | "choice" | "upload" | "table" | "workflow";
  regenerate?: () => Promise<string>;
  initialValue?: string;
  optional?: boolean;
  submitLabel?: string;
  options: Array<{ label: string; value: string }>;
  columns?: Array<{ key: string; label: string; width?: number; link?: boolean; editable?: boolean; multiline?: boolean }>;
  rows?: Array<Record<string, string>>;
  rowDetail?: (row: Record<string, string>) => Promise<TableRowDetail>;
  selectable?: boolean;
};

type GradeBand = "success" | "accent" | "warning" | "danger" | "neutral";

interface RunInputPromptProps {
  runInput: RunInputData | null;
  onSubmit: (value: string | File[] | Array<Record<string, string>>) => void;
  onSkip: () => void;
  tableHasGrade: boolean;
  tableGradeIssue: (row: Record<string, string>) => string | null;
  tableGradeBand: (row: Record<string, string>) => { band: GradeBand };
  compareTableValues: (a: string, b: string) => number;
  csvCell: (value: string) => string;
  initialRows: Array<Record<string, string>>;
  GradeBadge: (props: { row: Record<string, string> }) => React.ReactNode;
  DetailSectionsView: (props: { text: string }) => React.ReactNode;
}

export function RunInputPrompt({
  runInput,
  onSubmit,
  onSkip,
  tableHasGrade,
  tableGradeIssue,
  tableGradeBand,
  compareTableValues,
  csvCell,
  initialRows,
  GradeBadge,
  DetailSectionsView,
}: RunInputPromptProps) {
  const [text, setText] = useState("");
  const [choice, setChoice] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<number, { open: boolean; status: "loading" | "done" | "error"; detail: TableRowDetail | null; error: string; run?: { status: "running" | "done"; result: CodeRunResult | null; error?: string } }>>({});
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);

  // While an editable cell has focus, the display order/membership is frozen
  // to these original indices so typing in a sorted/searched column does not
  // reorder or hide the row mid-edit (which would also steal focus).
  const [frozenOrder, setFrozenOrder] = useState<number[] | null>(null);

  // The display list: original indices ride along so selection, details, and
  // edits stay keyed to the underlying rows while the view filters/sorts.
  const tableDisplay = useMemo(() => {
    if (!runInput || runInput.kind !== "table") return [];
    if (frozenOrder) {
      return frozenOrder
        .map((index) => ({ row: rows[index], index }))
        .filter((entry) => entry.row !== undefined);
    }
    const query = search.trim().toLowerCase();
    let list = rows.map((row, index) => ({ row, index }));
    if (query) {
      const keys = (runInput.columns ?? []).filter((c) => !c.link).map((c) => c.key);
      list = list.filter(({ row }) => keys.some((k) => (row[k] ?? "").toLowerCase().includes(query)));
    }
    if (sort) {
      const { key, dir } = sort;
      list = [...list].sort(
        (a, b) => (dir === "asc" ? 1 : -1) * compareTableValues(a.row[key] ?? "", b.row[key] ?? "")
      );
    }
    return list;
  }, [runInput, rows, search, sort, frozenOrder, compareTableValues]);

  const tableGradeStats = useMemo(() => {
    if (!tableHasGrade) return null;
    const values: number[] = [];
    let invalid = 0;
    let missing = 0;
    for (const row of rows) {
      if ((row.grade ?? "").trim() === "") missing += 1;
      else if (tableGradeIssue(row)) invalid += 1;
      else values.push(parseFloat(row.grade));
    }
    if (values.length === 0) return { invalid, missing, avg: null as number | null, median: null as number | null, min: null as number | null, max: null as number | null };
    const sorted = [...values].sort((x, y) => x - y);
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    const median =
      sorted.length % 2 === 1
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
    return { invalid, missing, avg, median, min: sorted[0], max: sorted[sorted.length - 1] };
  }, [tableHasGrade, rows, tableGradeIssue]);

  // Compact distribution bar data: counts per percentage band, current rows,
  // recomputed as grades are edited. Rows that cannot be percentage-banded
  // (no grade, invalid, or no outOf) are excluded from the bar entirely -
  // null when there is nothing bandable yet, so the bar can hide itself.
  const tableGradeDist = useMemo(() => {
    if (!tableHasGrade) return null;
    const counts: Record<Exclude<GradeBand, "neutral">, number> = {
      success: 0,
      accent: 0,
      warning: 0,
      danger: 0,
    };
    for (const row of rows) {
      const { band } = tableGradeBand(row);
      if (band !== "neutral") counts[band] += 1;
    }
    const total = counts.success + counts.accent + counts.warning + counts.danger;
    if (total === 0) return null;
    const segments: Array<{ band: Exclude<GradeBand, "neutral">; label: string; count: number }> = [
      { band: "success", label: "90%+", count: counts.success },
      { band: "accent", label: "80-89%", count: counts.accent },
      { band: "warning", label: "70-79%", count: counts.warning },
      { band: "danger", label: "below 70%", count: counts.danger },
    ];
    return {
      total,
      segments,
      ariaLabel: segments.map((s) => `${s.count} at ${s.label}`).join(", "),
    };
  }, [tableHasGrade, rows, tableGradeBand]);

  useEffect(() => {
    if (!runInput) return;
    setText(runInput.kind === "text" ? runInput.initialValue ?? "" : "");
    setChoice("");
    setFiles([]);
    setRows(runInput.rows ?? []);
    setChecked((runInput.rows ?? []).map(() => true));
    setBusy(false);
    setError(null);
    setDetails({});
    setSearch("");
    setSort(null);
    setFrozenOrder(null);
  }, [runInput?.groupIndex, runInput?.stepIndex, runInput?.kind, runInput]);

  if (!runInput) return null;

  // Selected rows with invalid grades block approval (a typo would otherwise
  // surface only as a silent per-student skip after posting).
  const tableCheckedInvalid = tableHasGrade
    ? rows.filter((row, i) => (checked[i] ?? true) && tableGradeIssue(row)).length
    : 0;

  return (
    <div style={{ marginTop: 12 }}>
      <p className={styles.fieldHint}>{runInput.message}</p>

      {runInput.kind === "text" && (
        <>
          <TextField
            size="small"
            fullWidth
            multiline
            minRows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={busy}
            style={{ marginTop: 8 }}
          />
          {runInput.regenerate && (
            <Button
              size="small"
              variant="outlined"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  const result = await runInput.regenerate!();
                  setText(result);
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : "Regeneration failed"
                  );
                } finally {
                  setBusy(false);
                }
              }}
              style={{ marginTop: 8 }}
            >
              Regenerate with AI
            </Button>
          )}
          {error && (
            <p className={styles.error} style={{ marginTop: 8 }}>
              {error}
            </p>
          )}
        </>
      )}

      {(runInput.kind === "choice" || runInput.kind === "workflow") && (
        <TextField
          size="small"
          fullWidth
          select
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          style={{ marginTop: 8 }}
        >
          <MenuItem value="" disabled>
            Choose...
          </MenuItem>
          {runInput.options.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
        </TextField>
      )}

      {runInput.kind === "upload" && (
        <>
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.multiple = true;
              input.accept = ".zip";
              input.onchange = (e) => {
                const newFiles = Array.from(
                  (e.target as HTMLInputElement).files ?? []
                );
                setFiles(newFiles);
              };
              input.click();
            }}
            style={{ marginTop: 8 }}
          >
            Choose zip...
          </Button>
          {files.length > 0 && (
            <p className={styles.fieldHint} style={{ margin: "8px 0 0 0" }}>
              {files.map((f) => f.name).join(", ")}
            </p>
          )}
        </>
      )}

      {runInput.kind === "table" && runInput.columns && (
        <>
          <h3 className={styles.workflowReviewHeading}>
            {tableHasGrade ? "Grade review" : "Review table"}
          </h3>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
            <TextField
              size="small"
              placeholder="Search rows..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ width: 220 }}
            />
            {tableGradeStats && (
              <span style={{ fontSize: "0.8rem", color: "var(--hint-text)" }}>
                {tableGradeStats.avg !== null
                  ? `avg ${tableGradeStats.avg.toFixed(1)} - median ${tableGradeStats.median!.toFixed(1)} - min ${tableGradeStats.min} - max ${tableGradeStats.max}`
                  : "no valid grades yet"}
                {tableGradeStats.missing > 0 && ` - ${tableGradeStats.missing} without a grade (comment-only)`}
                {tableGradeStats.invalid > 0 && (
                  <span style={{ color: "var(--danger)" }}>
                    {` - ${tableGradeStats.invalid} invalid grade(s)`}
                  </span>
                )}
              </span>
            )}
            {tableGradeDist && (
              <div
                role="img"
                aria-label={`Grade distribution - ${tableGradeDist.ariaLabel}`}
                title={tableGradeDist.ariaLabel}
                style={{
                  display: "flex",
                  height: 8,
                  width: 140,
                  borderRadius: 999,
                  overflow: "hidden",
                  background: "var(--surface-subtle)",
                  flex: "none",
                }}
              >
                {tableGradeDist.segments
                  .filter((s) => s.count > 0)
                  .map((s) => (
                    <div
                      key={s.band}
                      style={{
                        width: `${(s.count / tableGradeDist.total) * 100}%`,
                        background: `var(--${s.band})`,
                      }}
                    />
                  ))}
              </div>
            )}
            <span style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
              {tableHasGrade && tableGradeStats && tableGradeStats.invalid > 0 && runInput.selectable && (
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() =>
                    setChecked((prev) =>
                      prev.map((c, i) => (tableGradeIssue(rows[i] ?? {}) ? false : c))
                    )
                  }
                >
                  Uncheck invalid
                </button>
              )}
              <button
                type="button"
                className={styles.linkButton}
                onClick={() => {
                  const cols = (runInput.columns ?? []).filter((c) => !c.link);
                  const header = [...cols.map((c) => c.label), ...(runInput.selectable ? ["Selected"] : [])];
                  const lines = [header.map(csvCell).join(",")];
                  for (const { row, index } of tableDisplay) {
                    lines.push(
                      [
                        ...cols.map((c) => csvCell(row[c.key] ?? "")),
                        ...(runInput.selectable ? [(checked[index] ?? true) ? "yes" : "no"] : []),
                      ].join(",")
                    );
                  }
                  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "review-table.csv";
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
              >
                Download CSV
              </button>
            </span>
          </div>
          {search.trim() && (
            <p className={styles.fieldHint} style={{ margin: "6px 0 0 0" }}>
              Showing {tableDisplay.length} of {rows.length} row(s); selection actions and the CSV export cover only the visible rows.
            </p>
          )}
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
                {runInput.selectable && (
                  <th
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
                        setChecked((prev) => prev.map((c, i) => (visible.has(i) ? !allChecked : c)));
                      }}
                    />
                  </th>
                )}
                {runInput.columns.map((col) => (
                  <th
                    key={col.key}
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
                      cursor: col.link ? undefined : "pointer",
                      userSelect: "none",
                    }}
                    title={col.link ? undefined : "Sort by this column"}
                    onClick={() => {
                      if (col.link) return;
                      setSort((prev) =>
                        prev?.key !== col.key
                          ? { key: col.key, dir: "asc" }
                          : prev.dir === "asc"
                            ? { key: col.key, dir: "desc" }
                            : null
                      );
                    }}
                  >
                    {col.label}
                    {sort?.key === col.key && (
                      <span style={{ marginLeft: 4, fontSize: "0.7em", color: "var(--hint-text)" }}>
                        {sort.dir === "asc" ? "(asc)" : "(desc)"}
                      </span>
                    )}
                  </th>
                ))}
                {runInput.rowDetail && (
                  <th
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
                const hasDetail = runInput.rowDetail !== undefined;
                const colSpan = (runInput.selectable ? 1 : 0) + (runInput.columns?.length ?? 0) + (hasDetail ? 1 : 0);
                const initialRow = initialRows[rowIndex];
                const rowDirty =
                  initialRow !== undefined &&
                  (runInput.columns ?? []).some(
                    (c) => c.editable && (row[c.key] ?? "") !== (initialRow[c.key] ?? "")
                  );
                const rowSelected = checked[rowIndex] ?? true;
                return (
                  <Fragment key={rowIndex}>
                    <tr
                      className={`${styles.workflowTableRow} ${
                        runInput.selectable
                          ? rowSelected
                            ? styles.workflowTableRowSelected
                            : styles.workflowTableRowUnselected
                          : ""
                      }`}
                    >
                      {runInput.selectable && (
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
                              setChecked((prev) =>
                                prev.map((c, idx) =>
                                  idx === rowIndex ? !c : c
                                )
                              );
                            }}
                          />
                        </td>
                      )}
                      {runInput.columns!.map((col) => (
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
                                setFrozenOrder((prev) => prev ?? tableDisplay.map(({ index }) => index))
                              }
                              onBlur={() => setFrozenOrder(null)}
                              onChange={(e) => {
                                setRows((prev) =>
                                  prev.map((r, idx) =>
                                    idx === rowIndex
                                      ? { ...r, [col.key]: e.target.value }
                                      : r
                                  )
                                );
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
                                setRows((prev) =>
                                  prev.map((r, idx) => (idx === rowIndex ? { ...initialRows[rowIndex] } : r))
                                );
                              }}
                            >
                              Reset
                            </button>
                          )}
                          <button
                            className={styles.linkButton}
                            onClick={async () => {
                              if (detail?.open) {
                                setDetails((prev) => ({
                                  ...prev,
                                  [rowIndex]: { ...prev[rowIndex]!, open: false },
                                }));
                              } else if (detail?.status === "done") {
                                setDetails((prev) => ({
                                  ...prev,
                                  [rowIndex]: { ...prev[rowIndex]!, open: true },
                                }));
                              } else {
                                setDetails((prev) => ({
                                  ...prev,
                                  [rowIndex]: { open: true, status: "loading", detail: null, error: "" },
                                }));
                                try {
                                  const result = await runInput.rowDetail!(row);
                                  setDetails((prev) => ({
                                    ...prev,
                                    [rowIndex]: { open: true, status: "done", detail: result, error: "" },
                                  }));
                                } catch (err) {
                                  setDetails((prev) => ({
                                    ...prev,
                                    [rowIndex]: {
                                      open: true,
                                      status: "error",
                                      detail: null,
                                      error: err instanceof Error ? err.message : "Error loading submission",
                                    },
                                  }));
                                }
                              }
                            }}
                          >
                            {detail?.open ? "Hide" : "Preview"}
                          </button>
                        </td>
                      )}
                    </tr>
                    {hasDetail && detail?.open && (
                      <tr>
                        <td
                          colSpan={colSpan}
                          className={styles.workflowDetailCell}
                          style={{
                            borderBottom: "1px solid var(--field-border)",
                            padding: "10px 12px 10px 20px",
                          }}
                        >
                          {detail.status === "loading" && <div>Loading submission...</div>}
                          {detail.status === "error" && (
                            <div style={{ color: "var(--danger)" }}>{detail.error}</div>
                          )}
                          {detail.status === "done" && detail.detail && (
                            <div>
                              <div
                                style={{
                                  maxHeight: 300,
                                  overflow: "auto",
                                  fontSize: "0.85rem",
                                  padding: "10px 12px",
                                  background: "var(--card-background)",
                                  border: "1px solid var(--field-border)",
                                  borderRadius: "6px",
                                  marginBottom: "12px",
                                }}
                              >
                                <DetailSectionsView text={detail.detail.text} />
                              </div>
                              {detail.detail.files && detail.detail.files.length > 0 && (
                                <div>
                                  {detail.detail.files.map((file) => {
                                    const isTextLike = file.mimeType.startsWith("text/") ||
                                      ["py", "js", "ts", "jsx", "tsx", "java", "c", "cpp", "h", "cs", "rb", "go", "rs", "php", "html", "css", "json", "md", "txt", "sql", "sh", "yml", "yaml"].includes(
                                        file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() || "" : ""
                                      );
                                    const content = isTextLike
                                      ? (() => {
                                          try {
                                            const bytes = Uint8Array.from(atob(file.base64), c => c.charCodeAt(0));
                                            const text = new TextDecoder().decode(bytes);
                                            return text.length > 20000 ? text.substring(0, 20000) + "\n... (truncated)" : text;
                                          } catch {
                                            return "(Error decoding file)";
                                          }
                                        })()
                                      : "(binary file - download via SpeedGrader)";
                                    return (
                                      <div key={file.name} className={styles.workflowCard} style={{ marginTop: "8px" }}>
                                        <div style={{ fontWeight: "bold", marginBottom: "4px" }}>{file.name}</div>
                                        <pre
                                          style={{
                                            fontFamily: "monospace",
                                            fontSize: "0.8rem",
                                            whiteSpace: "pre-wrap",
                                            margin: 0,
                                            maxHeight: 240,
                                            overflow: "auto",
                                          }}
                                        >
                                          {content}
                                        </pre>
                                      </div>
                                    );
                                  })}
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    disabled={detail.run?.status === "running"}
                                    onClick={async () => {
                                      setDetails((prev) => ({
                                        ...prev,
                                        [rowIndex]: {
                                          ...prev[rowIndex]!,
                                          run: { status: "running", result: null },
                                        },
                                      }));
                                      try {
                                        const result = await runSubmissionCodeAction(
                                          (detail.detail?.files ?? []).map((f) => ({
                                            name: f.name,
                                            extension: f.name.includes(".") ? f.name.split(".").pop()!.toLowerCase() : "",
                                            rawBase64: f.base64,
                                          }))
                                        );
                                        setDetails((prev) => ({
                                          ...prev,
                                          [rowIndex]: {
                                            ...prev[rowIndex]!,
                                            run: { status: "done", result },
                                          },
                                        }));
                                      } catch (err) {
                                        setDetails((prev) => ({
                                          ...prev,
                                          [rowIndex]: {
                                            ...prev[rowIndex]!,
                                            run: {
                                              status: "done",
                                              result: null,
                                              error: err instanceof Error ? err.message : "Run failed.",
                                            },
                                          },
                                        }));
                                      }
                                    }}
                                    style={{ marginTop: "8px" }}
                                  >
                                    {detail.run?.status === "running" ? "Running..." : detail.run?.result ? "Run again" : "Run code"}
                                  </Button>
                                  {detail.run?.result && (
                                    <div className={styles.workflowCard} style={{ marginTop: "12px" }}>
                                      <div style={{ fontWeight: "bold", marginBottom: "8px" }}>
                                        {detail.run.result.language} - {detail.run.result.ran ? `ran (exit ${detail.run.result.exitCode})` : `failed${detail.run.result.exitCode !== null ? ` (exit ${detail.run.result.exitCode})` : ""}`}
                                      </div>
                                      {detail.run.result.error && (
                                        <div style={{ marginBottom: "8px" }}>
                                          <div style={{ fontSize: "0.75rem", color: "var(--hint-text)", marginBottom: "4px" }}>Error</div>
                                          <pre
                                            style={{
                                              fontFamily: "monospace",
                                              fontSize: "0.8rem",
                                              whiteSpace: "pre-wrap",
                                              margin: "0",
                                              maxHeight: 240,
                                              overflow: "auto",
                                              padding: 8,
                                              background: "var(--card-background)",
                                              border: "1px solid var(--field-border)",
                                              borderRadius: 4,
                                            }}
                                          >
                                            {detail.run.result.error}
                                          </pre>
                                        </div>
                                      )}
                                      {detail.run.result.compileOutput && (
                                        <div style={{ marginBottom: "8px" }}>
                                          <div style={{ fontSize: "0.75rem", color: "var(--hint-text)", marginBottom: "4px" }}>Compile output</div>
                                          <pre
                                            style={{
                                              fontFamily: "monospace",
                                              fontSize: "0.8rem",
                                              whiteSpace: "pre-wrap",
                                              margin: "0",
                                              maxHeight: 240,
                                              overflow: "auto",
                                              padding: 8,
                                              background: "var(--card-background)",
                                              border: "1px solid var(--field-border)",
                                              borderRadius: 4,
                                            }}
                                          >
                                            {detail.run.result.compileOutput}
                                          </pre>
                                        </div>
                                      )}
                                      {detail.run.result.stdout && (
                                        <div style={{ marginBottom: "8px" }}>
                                          <div style={{ fontSize: "0.75rem", color: "var(--hint-text)", marginBottom: "4px" }}>Output</div>
                                          <pre
                                            style={{
                                              fontFamily: "monospace",
                                              fontSize: "0.8rem",
                                              whiteSpace: "pre-wrap",
                                              margin: "0",
                                              maxHeight: 240,
                                              overflow: "auto",
                                              padding: 8,
                                              background: "var(--card-background)",
                                              border: "1px solid var(--field-border)",
                                              borderRadius: 4,
                                            }}
                                          >
                                            {detail.run.result.stdout}
                                          </pre>
                                        </div>
                                      )}
                                      {detail.run.result.stderr && (
                                        <div style={{ marginBottom: "8px" }}>
                                          <div style={{ fontSize: "0.75rem", color: "var(--hint-text)", marginBottom: "4px" }}>Stderr</div>
                                          <pre
                                            style={{
                                              fontFamily: "monospace",
                                              fontSize: "0.8rem",
                                              whiteSpace: "pre-wrap",
                                              margin: "0",
                                              maxHeight: 240,
                                              overflow: "auto",
                                              padding: 8,
                                              background: "var(--card-background)",
                                              border: "1px solid var(--field-border)",
                                              borderRadius: 4,
                                            }}
                                          >
                                            {detail.run.result.stderr}
                                          </pre>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {detail.run?.result === null && detail.run?.status === "done" && (
                                    detail.run.error ? (
                                      <div style={{ marginTop: "12px", color: "var(--danger)", fontSize: "0.85rem" }}>
                                        Run failed: {detail.run.error}
                                      </div>
                                    ) : (
                                      <div style={{ marginTop: "12px", color: "var(--hint-text)", fontSize: "0.85rem" }}>
                                        No runnable code detected.
                                      </div>
                                    )
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      <div
        className={runInput.kind === "table" ? styles.workflowActionBar : undefined}
        style={{
          display: "flex",
          gap: 8,
          marginTop: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <Button
          size="small"
          variant="contained"
          disabled={
            busy ||
            (runInput.kind === "text"
              ? !text.trim()
              : runInput.kind === "choice" || runInput.kind === "workflow"
                ? !choice
                : runInput.kind === "upload"
                  ? files.length === 0
                  : runInput.kind === "table" && runInput.selectable
                    ? rows.filter((_, idx) => checked[idx]).length === 0 ||
                      tableCheckedInvalid > 0
                    : rows.length === 0)
          }
          onClick={() => {
            let value: string | File[] | Array<Record<string, string>>;
            if (runInput.kind === "text") {
              value = text;
            } else if (
              runInput.kind === "choice" ||
              runInput.kind === "workflow"
            ) {
              value = choice;
            } else if (runInput.kind === "upload") {
              value = files;
            } else if (runInput.kind === "table") {
              value = runInput.selectable
                ? rows.filter((_, idx) => checked[idx])
                : rows;
            } else {
              value = rows;
            }
            onSubmit(value as string | File[] | Array<Record<string, string>>);
          }}
        >
          {runInput.kind === "workflow"
            ? "Run selected workflow after this run"
            : runInput.submitLabel ?? "Submit"}
        </Button>
        {runInput.optional && (
          <Button
            size="small"
            variant="text"
            disabled={busy}
            onClick={() => {
              onSkip();
            }}
          >
            Skip
          </Button>
        )}
        {!runInput.optional && (
          <Button
            size="small"
            variant="outlined"
            disabled={busy}
            onClick={() => {
              onSkip();
            }}
          >
            Cancel run
          </Button>
        )}
        {runInput.kind === "table" && runInput.selectable && (
          <span style={{ fontSize: "0.75rem", color: "var(--hint-text)", marginLeft: "auto" }}>
            {checked.filter(Boolean).length} of {rows.length} row(s) selected
            {tableCheckedInvalid > 0 && (
              <span style={{ color: "var(--danger)" }}>
                {` - ${tableCheckedInvalid} selected row(s) have an invalid grade; fix them or uncheck them to enable ${runInput.submitLabel ?? "Submit"}`}
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
