"use client";

import { useEffect, useRef, useState } from "react";
import {
  generateRubricFromRepoAction,
  gradeReposAction,
  dispatchTestsAction,
  getTestRunStatusAction,
  type GradeActionState,
} from "../actions";
import { useLlmProvider } from "@/lib/llm-provider";
import GithubRepoPicker from "./GithubRepoPicker";
import GradingResults from "./GradingResults";
import styles from "../page.module.css";

type GradingRun = NonNullable<GradeActionState["run"]>;

type TestState = {
  status: "idle" | "running" | "done" | "error";
  ref?: string;
  since?: string;
  conclusion?: string | null;
  htmlUrl?: string;
  message?: string;
};

type QueueRow = { id: string; repoRef: string; branch: string; label: string; test: TestState };

const QUEUE_KEY = "ta-github-grading-queue";
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function TestStatusCell({ test }: { test: TestState }) {
  if (test.status === "idle") return <span style={{ color: "#94a3b8", fontSize: "0.82rem" }}>—</span>;
  if (test.status === "error")
    return <span style={{ color: "#dc2626", fontSize: "0.82rem" }}>{test.message ?? "Error"}</span>;
  const ok = test.conclusion === "success";
  const failed = test.conclusion === "failure" || test.conclusion === "timed_out";
  const color = test.status === "running" ? "#2563eb" : ok ? "#16a34a" : failed ? "#dc2626" : "#64748b";
  const label =
    test.status === "running" ? "Running…" : ok ? "Passed" : failed ? "Failed" : test.conclusion ?? "Done";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.82rem" }}>
      <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: "50%", background: color }} />
      <strong style={{ color }}>{label}</strong>
      {test.htmlUrl && (
        <a href={test.htmlUrl} target="_blank" rel="noreferrer">
          view
        </a>
      )}
    </span>
  );
}

/**
 * Queue several students' GitHub repos, grade them all against one rubric (one
 * results matrix with a row per student), and run each repo's unit tests via
 * GitHub Actions (workflow_dispatch) with live pass/fail status.
 */
export default function GithubGradingPanel() {
  const [provider] = useLlmProvider();
  const [queue, setQueue] = useState<QueueRow[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      if (!raw) return [];
      const saved = JSON.parse(raw) as Array<{ id?: string; repoRef: string; branch?: string; label?: string }>;
      return saved.map((r) => ({ id: r.id ?? newId(), repoRef: r.repoRef, branch: r.branch ?? "", label: r.label ?? "", test: { status: "idle" as const } }));
    } catch {
      return [];
    }
  });
  // Add-to-queue inputs.
  const [pickRepo, setPickRepo] = useState("");
  const [pickBranch, setPickBranch] = useState("");
  const [pickLabel, setPickLabel] = useState("");
  // Grading inputs.
  const [instructions, setInstructions] = useState("");
  const [rubric, setRubric] = useState("");
  const [rubricRepo, setRubricRepo] = useState("");
  const [rubricBranch, setRubricBranch] = useState("");
  const [workflowFile, setWorkflowFile] = useState("");
  const [run, setRun] = useState<GradingRun | null>(null);
  const [busy, setBusy] = useState<"" | "rubric" | "grade">("");
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const aliveRef = useRef(true);

  // Track mount so detached test-poll loops don't setState after unmount.
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const persist = (rows: QueueRow[]) => {
    setQueue(rows);
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(rows.map((r) => ({ id: r.id, repoRef: r.repoRef, branch: r.branch, label: r.label }))));
    } catch {
      /* ignore quota errors */
    }
  };

  const setTest = (id: string, patch: Partial<TestState>) =>
    setQueue((rows) => rows.map((r) => (r.id === id ? { ...r, test: { ...r.test, ...patch } } : r)));

  const onCopy = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
  };

  const addToQueue = () => {
    if (!pickRepo.trim()) return;
    persist([...queue, { id: newId(), repoRef: pickRepo.trim(), branch: pickBranch, label: pickLabel.trim(), test: { status: "idle" } }]);
    setPickRepo("");
    setPickBranch("");
    setPickLabel("");
  };

  const removeRow = (id: string) => persist(queue.filter((r) => r.id !== id));

  const genRubric = async () => {
    if (!rubricRepo.trim()) {
      setError("Choose a reference repository for the rubric.");
      return;
    }
    setBusy("rubric");
    setError(null);
    const r = await generateRubricFromRepoAction(rubricRepo.trim(), instructions, provider, rubricBranch || undefined);
    setBusy("");
    if ("error" in r) setError(r.error);
    else setRubric(r.rubric);
  };

  const gradeAll = async () => {
    if (queue.length === 0) {
      setError("Add at least one repository to the queue.");
      return;
    }
    setBusy("grade");
    setError(null);
    setRun(null);
    const r = await gradeReposAction(
      queue.map((q) => ({ repoRef: q.repoRef, branch: q.branch || undefined, label: q.label || undefined })),
      instructions,
      rubric,
      provider
    );
    setBusy("");
    if ("error" in r) {
      setError(r.error);
      return;
    }
    setRun(r.run);
    setRubric(r.rubric);
  };

  // Poll a dispatched run until it completes.
  const pollTest = (id: string, repoRef: string, ref: string, since: string) => {
    let attempts = 0;
    const tick = async () => {
      if (!aliveRef.current) return;
      attempts += 1;
      const r = await getTestRunStatusAction(repoRef, ref, since);
      if (!aliveRef.current) return;
      if ("error" in r) {
        setTest(id, { status: "error", message: r.error });
        return;
      }
      const found = r.run;
      if (found && found.status === "completed") {
        setTest(id, { status: "done", conclusion: found.conclusion, htmlUrl: found.htmlUrl });
        return;
      }
      if (found) setTest(id, { status: "running", htmlUrl: found.htmlUrl });
      if (attempts < 160) window.setTimeout(tick, found ? 5000 : 4000);
      else setTest(id, { status: "error", message: "Timed out waiting for the run." });
    };
    void tick();
  };

  const runTests = async (row: QueueRow) => {
    setTest(row.id, { status: "running", message: undefined, conclusion: undefined, htmlUrl: undefined });
    const r = await dispatchTestsAction(row.repoRef, row.branch || undefined, workflowFile.trim() || undefined);
    if ("error" in r) {
      setTest(row.id, { status: "error", message: r.error });
      return;
    }
    pollTest(row.id, row.repoRef, r.ref, r.since);
  };

  const runAllTests = () => {
    for (const row of queue) void runTests(row);
  };

  return (
    <>
      <p style={{ marginTop: 0, color: "var(--text-secondary)", lineHeight: 1.5 }}>
        Queue students&apos; repositories, grade them all against one rubric, and run each repo&apos;s unit tests
        via GitHub Actions. Running tests needs a <code>workflow_dispatch</code> workflow in each repo.
      </p>

      {/* Add to queue */}
      <div className={styles.field}>
        <label>Add a student repository</label>
        <GithubRepoPicker value={pickRepo} onChange={setPickRepo} branch={pickBranch} onBranchChange={setPickBranch} disabled={!!busy} />
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <input
            type="text"
            value={pickLabel}
            placeholder="Student name (optional)"
            onChange={(e) => setPickLabel(e.target.value)}
            style={{ flex: "1 1 200px", padding: "8px 10px", border: "1px solid var(--field-border, #cbd5e1)", borderRadius: 8, fontSize: "0.9rem" }}
          />
          <button type="button" className={styles.submitButton} onClick={addToQueue} disabled={!pickRepo.trim()}>
            Add to queue
          </button>
        </div>
      </div>

      {/* Queue table */}
      {queue.length > 0 && (
        <div className={styles.field}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <label style={{ margin: 0 }}>Queue ({queue.length})</label>
            <button type="button" className={styles.submitButton} onClick={runAllTests}>
              Run all tests
            </button>
          </div>
          <div style={{ border: "1px solid var(--field-border, #e2e8f0)", borderRadius: 8, marginTop: 6 }}>
            {queue.map((row, i) => (
              <div
                key={row.id}
                style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 10px", borderTop: i === 0 ? "none" : "1px solid #f1f5f9", flexWrap: "wrap" }}
              >
                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                  <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.label || row.repoRef}
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.repoRef}
                    {row.branch ? ` @ ${row.branch}` : ""}
                  </div>
                </div>
                <div style={{ flex: "0 0 auto" }}>
                  <TestStatusCell test={row.test} />
                </div>
                <button
                  type="button"
                  className={styles.ccBtn}
                  onClick={() => void runTests(row)}
                  disabled={row.test.status === "running"}
                  style={{ flexShrink: 0 }}
                >
                  {row.test.status === "running" ? "Running…" : "Run tests"}
                </button>
                <button
                  type="button"
                  onClick={() => removeRow(row.id)}
                  style={{ flexShrink: 0, border: "1px solid var(--field-border, #cbd5e1)", background: "#fff", borderRadius: 8, padding: "4px 10px", fontSize: "0.8rem", color: "#334155", cursor: "pointer" }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: 6 }}>
            Workflow file to run (optional, applies to all):{" "}
            <input
              type="text"
              value={workflowFile}
              placeholder="e.g. tests.yml (defaults to the repo's first workflow)"
              onChange={(e) => setWorkflowFile(e.target.value)}
              style={{ padding: "4px 8px", border: "1px solid var(--field-border, #cbd5e1)", borderRadius: 6, fontSize: "0.8rem", minWidth: 240 }}
            />
          </p>
        </div>
      )}

      {/* Rubric */}
      <div className={styles.field}>
        <label>Assignment instructions (optional)</label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={3}
          placeholder="What the assignment asked for. Used to focus the rubric and grading."
          style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--field-border, #cbd5e1)", borderRadius: 8, fontSize: "0.9rem" }}
        />
      </div>

      <div className={styles.field}>
        <label>Reference repo for the rubric (optional)</label>
        <GithubRepoPicker value={rubricRepo} onChange={setRubricRepo} branch={rubricBranch} onBranchChange={setRubricBranch} disabled={!!busy} />
        <button type="button" className={styles.submitButton} style={{ marginTop: 8 }} onClick={genRubric} disabled={!!busy || !rubricRepo.trim()}>
          {busy === "rubric" ? "Generating rubric…" : "Generate rubric from reference code"}
        </button>
      </div>

      <div className={styles.field}>
        <label>Rubric (generated or pasted; auto-generated from the first repo if blank)</label>
        <textarea
          value={rubric}
          onChange={(e) => setRubric(e.target.value)}
          rows={8}
          placeholder="Leave blank to auto-generate at grading time."
          style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--field-border, #cbd5e1)", borderRadius: 8, fontSize: "0.85rem", fontFamily: "monospace" }}
        />
      </div>

      <button type="button" className={styles.submitButton} onClick={gradeAll} disabled={!!busy || queue.length === 0}>
        {busy === "grade" ? `Grading ${queue.length} repo${queue.length === 1 ? "" : "s"}…` : `Grade all (${queue.length})`}
      </button>

      {error && <p className={styles.error}>{error}</p>}

      {run && run.results.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <GradingResults run={run} canvasUrl="" copiedKey={copiedKey} onCopy={onCopy} onOpenPreview={() => {}} />
        </div>
      )}
    </>
  );
}
