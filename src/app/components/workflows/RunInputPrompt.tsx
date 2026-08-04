"use client";

import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { Button, MenuItem, TextField } from "@mui/material";
import type { TableRowDetail } from "@/lib/workflows/registry";
import { buildInitialPromptState, type PromptState } from "./run-input/run-input-prompt-state";
import type { RunInputColumn } from "./run-input/run-input-types";
import { RunInputTableSection } from "./run-input/RunInputTableSection";
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
  columns?: RunInputColumn[];
  rows?: Array<Record<string, string>>;
  rowDetail?: (row: Record<string, string>) => Promise<TableRowDetail>;
  selectable?: boolean;
};

interface RunInputPromptProps {
  runInput: RunInputData | null;
  onSubmit: (value: string | File[] | Array<Record<string, string>>) => void;
  onSkip: () => void;
  tableHasGrade: boolean;
  tableGradeIssue: (row: Record<string, string>) => string | null;
  csvCell: (value: string) => string;
  initialRows: Array<Record<string, string>>;
  GradeBadge: (props: { row: Record<string, string> }) => ReactNode;
  DetailSectionsView: (props: { text: string }) => ReactNode;
}

/**
 * Entry point for the mid-run "requireInput" prompt. This is a deliberately
 * thin dispatcher now (DEFECT 3): the text/choice/upload/workflow kinds are
 * small enough to stay inline, the `table` kind (the bulk of the original
 * ~900-line file - search, grade stats, distribution bar, CSV export, the
 * sticky sortable table, editable cells, and the per-row submission-detail
 * expander) is delegated to RunInputTableSection.tsx and its own siblings
 * under ./run-input/, mirroring the RuntimeFieldInput.tsx /
 * RuntimeFieldInputEntityPickers.tsx / RuntimeFieldInputTemplates.tsx split.
 * No caller needed to change - every prop here is unchanged from before the
 * split.
 *
 * DEFECT 4: the eleven pieces of per-prompt state (text/choice/files/rows/
 * checked/busy/error/details/search/sort/frozenOrder) are now ONE state
 * object (PromptState, run-input/run-input-prompt-state.ts) instead of
 * eleven separate useState calls, so the reset below is a single setState
 * rather than eleven synchronous ones inside the effect.
 */
export function RunInputPrompt({
  runInput,
  onSubmit,
  onSkip,
  tableHasGrade,
  tableGradeIssue,
  csvCell,
  initialRows,
  GradeBadge,
  DetailSectionsView,
}: RunInputPromptProps) {
  const [state, setState] = useState<PromptState>(() => buildInitialPromptState(null));

  // Resets the ENTIRE prompt state to fresh defaults for the new (or
  // absent) prompt - a single setState now (DEFECT 4), built by the same
  // pure function (buildInitialPromptState) the initial useState value
  // above uses, so both are guaranteed to agree on what "fresh" means.
  //
  // The reset itself is deferred past this render pass via an async IIFE
  // plus a `cancelled` guard - this repo's eslint rule forbids reaching
  // setState synchronously from an effect body; see WorkflowsTab.tsx's own
  // `await Promise.resolve()` comment for the same idiom used there.
  //
  // Dependency array is just `runInput` - useWorkflowRun.ts always hands
  // this a FRESH object per prompt (never mutates one in place), so listing
  // its individual fields (groupIndex/stepIndex/kind) alongside it would be
  // redundant: the object reference alone already changes exactly when any
  // of those would.
  useEffect(() => {
    if (!runInput) return;
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setState(buildInitialPromptState(runInput));
    })();
    return () => {
      cancelled = true;
    };
  }, [runInput]);

  if (!runInput) return null;

  // Selected rows with invalid grades block approval (a typo would otherwise
  // surface only as a silent per-student skip after posting).
  const tableCheckedInvalid = tableHasGrade
    ? state.rows.filter((row, i) => (state.checked[i] ?? true) && tableGradeIssue(row)).length
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
            value={state.text}
            onChange={(e) => {
              const newValue = e.target.value;
              setState((prev) => ({ ...prev, text: newValue }));
            }}
            disabled={state.busy}
            style={{ marginTop: 8 }}
          />
          {runInput.regenerate && (
            <Button
              size="small"
              variant="outlined"
              disabled={state.busy}
              onClick={async () => {
                setState((prev) => ({ ...prev, busy: true, error: null }));
                try {
                  const result = await runInput.regenerate!();
                  setState((prev) => ({ ...prev, text: result }));
                } catch (err) {
                  setState((prev) => ({
                    ...prev,
                    error: err instanceof Error ? err.message : "Regeneration failed",
                  }));
                } finally {
                  setState((prev) => ({ ...prev, busy: false }));
                }
              }}
              style={{ marginTop: 8 }}
            >
              Regenerate with AI
            </Button>
          )}
          {state.error && (
            <p className={styles.error} style={{ marginTop: 8 }}>
              {state.error}
            </p>
          )}
        </>
      )}

      {(runInput.kind === "choice" || runInput.kind === "workflow") && (
        <TextField
          size="small"
          fullWidth
          select
          value={state.choice}
          onChange={(e) => {
            const newValue = e.target.value;
            setState((prev) => ({ ...prev, choice: newValue }));
          }}
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
                setState((prev) => ({ ...prev, files: newFiles }));
              };
              input.click();
            }}
            style={{ marginTop: 8 }}
          >
            Choose zip...
          </Button>
          {state.files.length > 0 && (
            <p className={styles.fieldHint} style={{ margin: "8px 0 0 0" }}>
              {state.files.map((f) => f.name).join(", ")}
            </p>
          )}
        </>
      )}

      {runInput.kind === "table" && runInput.columns && (
        <RunInputTableSection
          columns={runInput.columns}
          selectable={runInput.selectable}
          rowDetail={runInput.rowDetail}
          state={state}
          setState={setState}
          tableHasGrade={tableHasGrade}
          tableGradeIssue={tableGradeIssue}
          csvCell={csvCell}
          initialRows={initialRows}
          GradeBadge={GradeBadge}
          DetailSectionsView={DetailSectionsView}
        />
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
            state.busy ||
            (runInput.kind === "text"
              ? !state.text.trim()
              : runInput.kind === "choice" || runInput.kind === "workflow"
                ? !state.choice
                : runInput.kind === "upload"
                  ? state.files.length === 0
                  : runInput.kind === "table" && runInput.selectable
                    ? state.rows.filter((_, idx) => state.checked[idx]).length === 0 ||
                      tableCheckedInvalid > 0
                    : state.rows.length === 0)
          }
          onClick={() => {
            let value: string | File[] | Array<Record<string, string>>;
            if (runInput.kind === "text") {
              value = state.text;
            } else if (
              runInput.kind === "choice" ||
              runInput.kind === "workflow"
            ) {
              value = state.choice;
            } else if (runInput.kind === "upload") {
              value = state.files;
            } else if (runInput.kind === "table") {
              value = runInput.selectable
                ? state.rows.filter((_, idx) => state.checked[idx])
                : state.rows;
            } else {
              value = state.rows;
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
            disabled={state.busy}
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
            disabled={state.busy}
            onClick={() => {
              onSkip();
            }}
          >
            Cancel run
          </Button>
        )}
        {runInput.kind === "table" && runInput.selectable && (
          <span style={{ fontSize: "0.75rem", color: "var(--hint-text)", marginLeft: "auto" }}>
            {state.checked.filter(Boolean).length} of {state.rows.length} row(s) selected
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
