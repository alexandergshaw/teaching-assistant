"use client";

// DEFECT 3 split - the run-input table's per-row detail expander: the
// loading/error/done states, the submission text sections, the per-file
// preview (base64-decoded when text-like), the "Run code" action, and the
// code-run output. Extracted out of RunInputPrompt.tsx's ~585-line `table`
// branch (MECHANICAL only, no behavior change) - mirrors the
// RuntimeFieldInput.tsx family split. RunInputTable.tsx owns the state (and
// the fetch/run-code side effects, since those need `setState` closures keyed
// by row index) and is the only caller; this component is purely
// presentational plus the one `onRunCode` trigger.
//
// The four near-identical output panels (error/compileOutput/stdout/stderr)
// the original inline JSX repeated verbatim are collapsed into one
// CodeOutputBlock below - same markup, written once.
import type { ReactNode } from "react";
import { Button } from "@mui/material";
import { isTextLikeSubmissionFile, decodeSubmissionFileText } from "./run-input-file-preview";
import type { RunInputDetailEntry } from "./run-input-prompt-state";
import styles from "../../../page.module.css";

function CodeOutputBlock({ label, text }: { label: string; text: string }) {
  return (
    <div style={{ marginBottom: "8px" }}>
      <div style={{ fontSize: "0.75rem", color: "var(--hint-text)", marginBottom: "4px" }}>{label}</div>
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
        {text}
      </pre>
    </div>
  );
}

export interface RunInputRowDetailProps {
  colSpan: number;
  detail: RunInputDetailEntry | undefined;
  DetailSectionsView: (props: { text: string }) => ReactNode;
  onRunCode: () => Promise<void>;
}

/** Renders the expandable detail `<tr>` for one row - RunInputTable.tsx
 * already guards this with `hasDetail && detail?.open` before rendering it,
 * so `detail` is only ever undefined transiently; this component still
 * treats that as "render nothing" rather than assuming it away. */
export function RunInputRowDetail({ colSpan, detail, DetailSectionsView, onRunCode }: RunInputRowDetailProps) {
  if (!detail?.open) return null;
  return (
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
                  const content = isTextLikeSubmissionFile(file.name, file.mimeType)
                    ? decodeSubmissionFileText(file.base64)
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
                  onClick={onRunCode}
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
                      <CodeOutputBlock label="Error" text={detail.run.result.error} />
                    )}
                    {detail.run.result.compileOutput && (
                      <CodeOutputBlock label="Compile output" text={detail.run.result.compileOutput} />
                    )}
                    {detail.run.result.stdout && (
                      <CodeOutputBlock label="Output" text={detail.run.result.stdout} />
                    )}
                    {detail.run.result.stderr && (
                      <CodeOutputBlock label="Stderr" text={detail.run.result.stderr} />
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
  );
}
