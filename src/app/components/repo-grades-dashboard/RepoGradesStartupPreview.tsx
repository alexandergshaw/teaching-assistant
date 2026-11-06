"use client";

import { useState, useTransition } from "react";
import { previewRepoGradeStartupPlanAction } from "@/app/actions/repo-grades-dashboard";
import styles from "../repo-grades/repo-grades-dashboard.module.css";

type Result = Awaited<ReturnType<typeof previewRepoGradeStartupPlanAction>>;
type Preview = Extract<Result, { status: "preview" }>;
type TargetState = Preview["targets"][number]["state"];

const HISTORY_LABELS: Record<Exclude<TargetState["status"], "blocked">, string> = {
  queued: "Planned",
  running: "Running",
  claimed: "Claim recorded",
  terminal: "Already processed",
  "not-started": "Previously left unstarted",
  succeeded: "Previously graded",
  "no-submission": "Previously found no submission",
  partial: "Earlier grading was partial",
  failed: "Earlier grading failed",
  unknown: "Earlier outcome unknown",
};

function historyLabel(state: TargetState) {
  if (state.status !== "blocked") return HISTORY_LABELS[state.status];
  return state.reason === "runtime-unavailable" ? "No prior attempt found" : "History unavailable";
}

function previewMessage(result: Result) {
  if (result.status === "discovery-disabled") return "Startup plan discovery is disabled.";
  if (result.status === "course-unavailable") return "The startup plan is unavailable for this class.";
  const { discovery, history, targets, targetCount } = result;
  if (discovery.status === "not-configured") return "Set a GitHub organization for this class to preview its plan.";
  if (discovery.status === "blocked") return `GitHub discovery stopped (${discovery.reason.replaceAll("-", " ")}).`;
  if (!discovery.enumerationComplete) return "GitHub returned an incomplete repository listing. The startup plan could not be determined.";

  const scope = targetCount
    ? `Showing ${targets.length} of ${targetCount} discovered repository folders.`
    : "No repository folders were found in the completed source scans.";
  const coverage = discovery.incompleteSources ? ` GitHub returned incomplete results for ${discovery.incompleteSources} ${discovery.incompleteSources === 1 ? "source" : "sources"}.` : "";
  const historyNote = history === "unknown" ? " Saved grading history could not be verified." : "";
  return scope + coverage + historyNote;
}

export function RepoGradesStartupPreview({ accountId, courseId }: { accountId: string; courseId: string }) {
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();

  function loadPreview() {
    startTransition(async () => {
      const preview = await previewRepoGradeStartupPlanAction(courseId, accountId)
        .catch(() => ({ status: "course-unavailable" } as const));
      setResult(preview);
    });
  }

  return (
    <details className={styles.profileSettings}>
      <summary>Startup plan preview</summary>
      <p>Check the saved repository sources and grading history for this class. Automatic grading is disabled.</p>
      <button type="button" disabled={pending} onClick={loadPreview}>Preview startup plan</button>
      <p role="status">{pending ? "Checking GitHub discovery and grading history." : result ? previewMessage(result) : ""}</p>
      {!pending && result?.status === "preview" && result.targets.length > 0 && (
        <div className={styles.scroll} role="region" aria-label="Startup plan targets" tabIndex={0}>
          <table className={styles.table} aria-label="Discovered repository folders and grading history">
            <thead>
              <tr>
                <th scope="col">Repository</th>
                <th scope="col">Folder</th>
                <th scope="col">Source ref</th>
                <th scope="col">Pinned commit</th>
                <th scope="col">Grading history</th>
              </tr>
            </thead>
            <tbody>
              {result.targets.map(({ repo, folder, sourceRef, commit, state }) => (
                <tr key={JSON.stringify([repo, folder, sourceRef, commit])}>
                  <th scope="row">{repo}</th>
                  <td>{folder}</td>
                  <td>{sourceRef}</td>
                  <td><code>{commit}</code></td>
                  <td>{historyLabel(state)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}
