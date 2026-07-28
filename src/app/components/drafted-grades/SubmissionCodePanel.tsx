"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Button, TextField, MenuItem } from "@mui/material";
import styles from "../../page.module.css";
import { fetchSubmissionRepoAction, runSubmissionCodeAction } from "../../actions";
import type { CodeRunResult } from "@/lib/code-runner";
import type { SubmissionRepoFile } from "@/lib/submission-repo";

// Monaco (the VS Code editor) is client-only; load it lazily with SSR
// disabled, matching FilesTab's usage in src/app/components/repo-detail.
const MonacoFileEditor = dynamic(() => import("../MonacoFileEditor"), {
  ssr: false,
  loading: () => (
    <div style={{ padding: 16, fontSize: "0.85rem", color: "var(--text-secondary)" }}>Loading editor...</div>
  ),
});

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "loaded"; repo: string; ref: string; truncated: boolean; files: SubmissionRepoFile[] };

/**
 * Lets an instructor load and run a submitted GitHub repo from the drafted
 * grades page, on demand. Nothing here fetches automatically on render -
 * loading every draft's repo on page load would be slow and would hammer the
 * GitHub API - the instructor clicks "Load code" per submission they want to
 * inspect. The fetch and the run both go through server actions (they need
 * GITHUB_TOKEN / the sandbox's env vars, so neither can run in the browser).
 */
export default function SubmissionCodePanel({ submissionUrl }: { submissionUrl: string }) {
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [selectedPath, setSelectedPath] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<CodeRunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const load = async () => {
    setState({ status: "loading" });
    setRunResult(null);
    setRunError(null);
    try {
      const res = await fetchSubmissionRepoAction(submissionUrl);
      if ("error" in res) {
        setState({ status: "error", error: res.error });
        return;
      }
      setState({ status: "loaded", ...res });
      setSelectedPath(res.files[0]?.path ?? "");
    } catch (err) {
      setState({ status: "error", error: err instanceof Error ? err.message : "Could not load the repository." });
    }
  };

  const handleRun = async () => {
    if (state.status !== "loaded") return;
    setRunning(true);
    setRunError(null);
    setRunResult(null);
    try {
      const res = await runSubmissionCodeAction(
        state.files.map((f) => ({
          name: f.path.split("/").pop() || f.path,
          extension: f.path.includes(".") ? f.path.split(".").pop()!.toLowerCase() : "",
          previewContent: f.text,
        }))
      );
      if (!res) {
        setRunError(
          "No runnable code was recognized among the loaded files. The sandbox supports Python, JavaScript, TypeScript, Java, C, and C++ only."
        );
      } else {
        setRunResult(res);
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Run failed.");
    } finally {
      setRunning(false);
    }
  };

  if (state.status === "idle") {
    return (
      <Button variant="outlined" size="small" onClick={() => void load()}>
        Load code
      </Button>
    );
  }

  if (state.status === "loading") {
    return <span className={styles.fieldHint}>Loading code from GitHub...</span>;
  }

  if (state.status === "error") {
    return (
      <div>
        <div className={styles.error}>{state.error}</div>
        <Button variant="outlined" size="small" onClick={() => void load()} style={{ marginTop: 6 }}>
          Try again
        </Button>
      </div>
    );
  }

  const selectedFile = state.files.find((f) => f.path === selectedPath) ?? state.files[0];

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <span className={`${styles.ghBadge} ${styles.ghBadgeWarning}`}>
          Live from GitHub - may not be the code this draft was graded against
        </span>
        <span className={styles.fieldHint} style={{ margin: 0 }}>
          {state.repo} @ {state.ref.slice(0, 12)}
        </span>
        {state.truncated && (
          <span className={styles.fieldHint} style={{ margin: 0 }}>
            (repository trimmed to fit size limits)
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        <TextField
          select
          size="small"
          value={selectedPath}
          onChange={(e) => setSelectedPath(e.target.value)}
          sx={{ minWidth: 220, flex: "1 1 220px" }}
        >
          {state.files.map((f) => (
            <MenuItem key={f.path} value={f.path}>
              {f.path}
            </MenuItem>
          ))}
        </TextField>
        <Button variant="contained" size="small" onClick={() => void handleRun()} disabled={running}>
          {running ? "Running..." : "Run"}
        </Button>
      </div>

      {selectedFile && (
        <MonacoFileEditor
          path={selectedFile.path}
          value={selectedFile.text}
          onChange={() => {}}
          height={320}
          readOnly
        />
      )}

      {(runResult || runError) && (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--field-border)", paddingTop: 12 }}>
          <p className={styles.previewMeta}>
            Code execution{runResult && !runResult.error ? ` (${runResult.language})` : ""}
          </p>
          {runError ? (
            <p className={styles.previewNotice}>{runError}</p>
          ) : runResult?.error ? (
            <p className={styles.previewNotice}>The code runner could not execute this submission: {runResult.error}</p>
          ) : runResult ? (
            <>
              <p className={styles.previewMeta}>Ran without errors: {runResult.ran ? "yes" : "no"}</p>
              {runResult.compileOutput && runResult.compileOutput.trim() && (
                <>
                  <p className={styles.previewMeta}>Compiler output</p>
                  <pre className={styles.previewContent}>{runResult.compileOutput}</pre>
                </>
              )}
              <p className={styles.previewMeta}>Output (stdout)</p>
              <pre className={styles.previewContent}>{runResult.stdout || "(none)"}</pre>
              {runResult.stderr && runResult.stderr.trim() && (
                <>
                  <p className={styles.previewMeta}>Errors (stderr)</p>
                  <pre className={styles.previewContent}>{runResult.stderr}</pre>
                </>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
