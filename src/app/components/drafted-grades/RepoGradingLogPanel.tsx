"use client";

// Drafted Grades tab - downloadable repo-grading run log
// (docs/repo-grading-records-acceptance-criteria.md, R1.6). Entry 342 built
// this run record (`payload.repoGradingLog`, src/lib/repo-grading-log.ts) and
// attached it to the grading_drafts row, but nothing rendered it: a grep for
// `repoGradingLog` across src/app/components returned nothing, so the log has
// been written on every repo-grading run and unreachable by any instructor
// since. This panel is the missing half.
//
// Every decision (whether to render at all, the summary line, the
// truncation note) is a pure function from repoGradingLogPanel.helpers.ts -
// this component only calls those, hands the result to triggerFileDownload,
// and renders, mirroring RepoGradesLogPanel.tsx's own split (that panel is a
// different, unrelated log - the Repo Grades view's localStorage activity
// log, entry 333 - not this one; the two are intentionally not shared code,
// see repo-grading-log.ts's header).
//
// The download goes through formatRepoGradingLogCsv/formatRepoGradingLogJson/
// repoGradingLogFileName (src/lib/repo-grading-log.ts, owned by a sibling
// change) and triggerFileDownload (course-planning/utils.ts) - never a
// hand-rolled CSV escaper or object-URL dance (REGRESSION entry 267 check 4,
// entry 333's own reuse, and this doc's own R1.6).
//
// This panel deliberately shows only the RUN-level summary (attempted/
// graded/skipped/failed, and the truncation note) rather than a per-entry
// table: a sibling change is concurrently adding a per-repo truncation fact
// onto individual log entries, so a hardcoded column list here would either
// omit that field or need updating in lockstep with a file this task does
// not own. The full per-entry detail - including whatever fields the
// entries carry by the time this ships - is always in the download.
import { Button } from "@mui/material";
import { triggerFileDownload } from "../course-planning/utils";
import { formatRepoGradingLogCsv, formatRepoGradingLogJson, repoGradingLogFileName } from "@/lib/repo-grading-log";
import type { GradingDraft } from "@/lib/grading-drafts";
import { hasRepoGradingLog, repoGradingLogSummaryLine, repoGradingLogTruncationNote } from "./repoGradingLogPanel.helpers";
import styles from "../../page.module.css";

export interface RepoGradingLogPanelProps {
  draft: GradingDraft;
}

/** Renders nothing for a draft with no repo-grading run log (an older draft,
 * or one from a non-repo source) - never an empty panel, per R1.6/the task's
 * own gap description. */
export default function RepoGradingLogPanel({ draft }: RepoGradingLogPanelProps) {
  if (!hasRepoGradingLog(draft.payload)) {
    return null;
  }

  const log = draft.payload.repoGradingLog;
  const truncationNote = repoGradingLogTruncationNote(log);

  const handleDownload = (format: "csv" | "json") => {
    // The one clock read in this panel - everything downstream (the filename
    // stamp, the JSON's exportedAt) takes it as a parameter, so the
    // formatting itself stays pure and pinned by repo-grading-log.test.ts.
    const now = new Date().toISOString();
    const text = format === "csv" ? formatRepoGradingLogCsv(log) : formatRepoGradingLogJson(log, { exportedAt: now });
    const filename = repoGradingLogFileName(draft.summary, format, now);
    const mimeType = format === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8";
    triggerFileDownload(new Blob([text], { type: mimeType }), filename);
  };

  return (
    <div className={styles.fieldHint} style={{ margin: "var(--space-1) 0 0", display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
      <span>
        Repo grading run: {repoGradingLogSummaryLine(log)}
        {truncationNote && <strong style={{ color: "var(--danger)", marginLeft: "var(--space-1)" }}>{truncationNote}</strong>}
      </span>
      <Button size="small" variant="text" style={{ minWidth: 0 }} onClick={() => handleDownload("csv")}>
        Download run log (CSV)
      </Button>
      <Button size="small" variant="text" style={{ minWidth: 0 }} onClick={() => handleDownload("json")}>
        Download run log (JSON)
      </Button>
    </div>
  );
}
