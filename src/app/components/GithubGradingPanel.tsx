"use client";

import { useState } from "react";
import {
  generateRubricFromRepoAction,
  gradeRepoAction,
  getRepoCiAction,
  type GradeActionState,
} from "../actions";
import type { WorkflowRunInfo } from "@/lib/github";
import { useLlmProvider } from "@/lib/llm-provider";
import GithubRepoPicker from "./GithubRepoPicker";
import GradingResults from "./GradingResults";
import styles from "../page.module.css";

type GradingRun = NonNullable<GradeActionState["run"]>;

function CiBadge({ ci }: { ci: WorkflowRunInfo }) {
  const ok = ci.conclusion === "success";
  const failed = ci.conclusion === "failure" || ci.conclusion === "timed_out";
  const color = ok ? "#16a34a" : failed ? "#dc2626" : "#64748b";
  const label = ci.status === "completed" ? ci.conclusion ?? "completed" : ci.status;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.82rem", color: "#334155" }}>
      <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: "50%", background: color }} />
      CI: <strong style={{ color }}>{label}</strong> · {ci.name}
      {ci.headBranch ? ` (${ci.headBranch})` : ""}
      {ci.htmlUrl && (
        <a href={ci.htmlUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 4 }}>
          view
        </a>
      )}
    </span>
  );
}

/**
 * Grade a student's GitHub repository against a rubric: pick a repo, optionally
 * generate the rubric from a reference codebase, see the latest CI run, then run
 * the AI grader and review/export the results in the standard grading matrix.
 */
export default function GithubGradingPanel() {
  const [provider] = useLlmProvider();
  const [repoRef, setRepoRef] = useState("");
  const [branch, setBranch] = useState("");
  const [instructions, setInstructions] = useState("");
  const [rubric, setRubric] = useState("");
  const [ci, setCi] = useState<WorkflowRunInfo | null>(null);
  const [ciChecked, setCiChecked] = useState(false);
  const [run, setRun] = useState<GradingRun | null>(null);
  const [busy, setBusy] = useState<"" | "rubric" | "grade" | "ci">("");
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const onCopy = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
  };

  const checkCi = async () => {
    if (!repoRef.trim()) return;
    setBusy("ci");
    setError(null);
    const r = await getRepoCiAction(repoRef.trim(), branch || undefined);
    setBusy("");
    setCiChecked(true);
    if ("error" in r) setError(r.error);
    else setCi(r.run);
  };

  const genRubric = async () => {
    if (!repoRef.trim()) {
      setError("Choose a repository first.");
      return;
    }
    setBusy("rubric");
    setError(null);
    const r = await generateRubricFromRepoAction(repoRef.trim(), instructions, provider, branch || undefined);
    setBusy("");
    if ("error" in r) setError(r.error);
    else setRubric(r.rubric);
  };

  const grade = async () => {
    if (!repoRef.trim()) {
      setError("Choose a repository first.");
      return;
    }
    setBusy("grade");
    setError(null);
    setRun(null);
    const r = await gradeRepoAction(repoRef.trim(), instructions, rubric, provider, branch || undefined);
    setBusy("");
    if ("error" in r) {
      setError(r.error);
      return;
    }
    setRun(r.run);
    setRubric(r.rubric);
  };

  return (
    <>
      <p style={{ marginTop: 0, color: "var(--text-secondary)", lineHeight: 1.5 }}>
        Grade a student&apos;s GitHub repository. Optionally generate the rubric from a reference codebase and
        check the repo&apos;s latest CI run, then run the grader and review or export the results.
      </p>

      <div className={styles.field}>
        <label>Repository</label>
        <GithubRepoPicker value={repoRef} onChange={(v) => { setRepoRef(v); setCi(null); setCiChecked(false); }} disabled={!!busy} branch={branch} onBranchChange={setBranch} />
      </div>

      <div className={styles.field}>
        <label>Assignment instructions (optional)</label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={4}
          placeholder="What the assignment asked for. Used to focus the rubric and grading."
          style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--field-border, #cbd5e1)", borderRadius: 8, fontSize: "0.9rem" }}
        />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className={styles.submitButton} onClick={genRubric} disabled={!!busy || !repoRef.trim()}>
          {busy === "rubric" ? "Generating rubric…" : "Generate rubric from code"}
        </button>
        <button type="button" className={styles.submitButton} onClick={checkCi} disabled={!!busy || !repoRef.trim()}>
          {busy === "ci" ? "Checking CI…" : "Check CI"}
        </button>
      </div>

      {ciChecked && (
        <p style={{ marginTop: 8 }}>{ci ? <CiBadge ci={ci} /> : <span style={{ fontSize: "0.82rem", color: "#64748b" }}>No GitHub Actions runs found for this repo.</span>}</p>
      )}

      <div className={styles.field} style={{ marginTop: 12 }}>
        <label>Rubric (generated or pasted; one is generated automatically if blank)</label>
        <textarea
          value={rubric}
          onChange={(e) => setRubric(e.target.value)}
          rows={8}
          placeholder="Leave blank to auto-generate from the repo at grading time."
          style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--field-border, #cbd5e1)", borderRadius: 8, fontSize: "0.85rem", fontFamily: "monospace" }}
        />
      </div>

      <button type="button" className={styles.submitButton} onClick={grade} disabled={!!busy || !repoRef.trim()}>
        {busy === "grade" ? "Grading…" : "Grade repository"}
      </button>

      {error && <p className={styles.error}>{error}</p>}

      {run && run.results.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <GradingResults
            run={run}
            canvasUrl=""
            copiedKey={copiedKey}
            onCopy={onCopy}
            onOpenPreview={() => {}}
            banner={ci ? <CiBadge ci={ci} /> : undefined}
          />
        </div>
      )}
    </>
  );
}
