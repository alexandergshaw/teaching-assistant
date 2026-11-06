"use client";

import { useId, useState, useTransition } from "react";
import { Accordion, AccordionDetails, AccordionSummary, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";
import { loadRepoGradesStartupPreview } from "./startup-preview-client";
import styles from "../repo-grades/repo-grades-dashboard.module.css";

type Result = Awaited<ReturnType<typeof loadRepoGradesStartupPreview>>;
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
  const summaryId = useId();
  const panelId = useId();
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();

  function loadPreview() {
    startTransition(async () => {
      const preview = await loadRepoGradesStartupPreview(courseId, accountId);
      setResult(preview);
    });
  }

  return (
    <Accordion>
      <AccordionSummary id={summaryId} aria-controls={panelId}>Startup plan preview</AccordionSummary>
      <AccordionDetails>
        <p>Read-only preview of the saved repository sources and grading history for this class.</p>
        <Button type="button" variant="outlined" size="small" disabled={pending} onClick={loadPreview}>Preview startup plan</Button>
        <p role="status">{pending ? "Checking GitHub discovery and grading history." : result ? previewMessage(result) : ""}</p>
        {!pending && result?.status === "preview" && result.targets.length > 0 && (
          <TableContainer className={styles.scroll} role="region" aria-label="Startup plan targets" tabIndex={0}>
            <Table className={styles.table} size="small" aria-label="Discovered repository folders and grading history">
              <TableHead>
                <TableRow>
                  <TableCell scope="col">Repository</TableCell>
                  <TableCell scope="col">Folder</TableCell>
                  <TableCell scope="col">Source ref</TableCell>
                  <TableCell scope="col">Pinned commit</TableCell>
                  <TableCell scope="col">Grading history</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {result.targets.map(({ repo, folder, sourceRef, commit, state }) => (
                  <TableRow key={JSON.stringify([repo, folder, sourceRef, commit])}>
                    <TableCell component="th" scope="row">{repo}</TableCell>
                    <TableCell>{folder}</TableCell>
                    <TableCell>{sourceRef}</TableCell>
                    <TableCell><code>{commit}</code></TableCell>
                    <TableCell>{historyLabel(state)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </AccordionDetails>
    </Accordion>
  );
}
