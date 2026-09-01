// The legibility probe (LegibilityProbeModal.tsx) - the downloadable run
// log. Pays the same docs/DEV_LOOP.md debt as grading-recording-log.ts and
// recording/discussion-replies-log.ts (both read in full before writing this
// file, and this file's own structure follows them): pure functions, no I/O,
// no clock reads (every timestamp is supplied by the caller as data, never
// Date.now()/toISOString() called in here) so a test pins an exact rendered
// CSV/JSON rather than asserting around "now"; escapeCsvValue
// (src/lib/course-tasks-view-csv.ts) reused rather than a local escaper.
//
// WHAT MAKES THIS LOG DIFFERENT: the probe already computes and shows
// everything worth logging - describeCaptureParameters (legibility-probe.ts)
// already renders the source/encoded dimensions, per-frame quality
// (including re-encodes), frame count and wire size as one honest sentence,
// and deriveProbeResultNotice already classifies the outcome. This module
// does not re-derive any of that; it only gives the modal somewhere to
// ACCUMULATE every run's already-computed line/notice/transcript across the
// modal's whole open lifetime (closing the modal discards everything, same
// as the probe's own "does not persist anything" contract), and a way to
// format the accumulated list. There is no "run settings" section the way
// grading-recording-log.ts has one (course/rubric/knowledge-context) - a
// probe run has nothing analogous to log at the run level, only the
// per-run list itself.
//
// PERSONAL DATA: the transcript is a VERBATIM read of whatever was on
// screen when a probe ran - if the instructor pointed the probe at a real
// student submission (the instrument's whole purpose, per legibility-probe.ts's
// own header: "capture a real submission page and see exactly what the model
// reads back"), the downloaded log carries that student's actual submitted
// work, verbatim, for as many runs as were made this session. No redaction
// option is offered - the instructor is looking at the same verbatim text on
// screen already (LegibilityProbeModal.tsx's own transcript panel), so
// downloading changes WHERE it lives, not whether the instructor already has
// it. Anyone forwarding this file is forwarding a student's submitted text;
// that is a fact to state plainly, not a defect to design around here.

import { escapeCsvValue } from "@/lib/course-tasks-view-csv";

export type LegibilityProbeOutcome = "success" | "warning" | "error";

/** One "Run legibility probe" click's complete result, captured at the
 * moment it completes. `captureParametersLine` is the EXACT string
 * describeCaptureParameters (legibility-probe.ts) rendered for this run -
 * passed in, never recomputed here, so the log can never say something
 * different from what the modal actually showed for that run.
 * `transcript` is `""` for a run that errored outright (no transcript key on
 * the action's result) - never a placeholder like "(nothing)", which the
 * modal itself only uses for DISPLAY of a real empty string, not for a
 * missing one; see LegibilityProbeModal.tsx's own `transcript || "(nothing)"`
 * for that distinction. */
export interface LegibilityProbeLogRun {
  at: string;
  frameCount: number;
  wireBytes: number;
  captureParametersLine: string;
  outcome: LegibilityProbeOutcome;
  noticeText: string;
  transcript: string;
}

export interface LegibilityProbeRunLog {
  runs: readonly LegibilityProbeLogRun[];
}

/** `runs` is used in the exact order given (never reordered/dropped) - the
 * caller passes the whole accumulated list, oldest run first, mirroring
 * buildDiscussionRepliesRunLog/buildGradingRecordingRunLog's own "never
 * silently drops what it was given" discipline. */
export function buildLegibilityProbeRunLog(runs: readonly LegibilityProbeLogRun[]): LegibilityProbeRunLog {
  return { runs };
}

// ---------------------------------------------------------------------------
// Summary.
// ---------------------------------------------------------------------------

export interface LegibilityProbeLogSummary {
  totalRuns: number;
  successCount: number;
  warningCount: number;
  errorCount: number;
}

export function summarizeLegibilityProbeRunLog(log: LegibilityProbeRunLog): LegibilityProbeLogSummary {
  let successCount = 0;
  let warningCount = 0;
  let errorCount = 0;
  for (const run of log.runs) {
    switch (run.outcome) {
      case "success":
        successCount += 1;
        break;
      case "warning":
        warningCount += 1;
        break;
      case "error":
        errorCount += 1;
        break;
      default: {
        const exhaustive: never = run.outcome;
        throw new Error(`Unhandled legibility probe outcome: ${String(exhaustive)}`);
      }
    }
  }
  return { totalRuns: log.runs.length, successCount, warningCount, errorCount };
}

/** The one-line summary shown above the download buttons. Never gated on
 * `totalRuns > 0` - a modal opened and closed without ever clicking "Run
 * legibility probe" still gets a true sentence ("0 runs"), which is exactly
 * the FAILED/never-attempted case docs/DEV_LOOP.md's placement rule exists
 * for. */
export function legibilityProbeLogSummaryLine(summary: LegibilityProbeLogSummary): string {
  const runWord = summary.totalRuns === 1 ? "run" : "runs";
  return (
    `${summary.totalRuns} probe ${runWord} this session - ` +
    `${summary.successCount} legible, ${summary.warningCount} near-empty, ${summary.errorCount} failed.`
  );
}

// ---------------------------------------------------------------------------
// CSV. One section - unlike grading-recording-log.ts/discussion-replies-log.ts
// there is no separate run-settings/batch/row split to make; a probe run IS
// the row.
// ---------------------------------------------------------------------------

const RUN_CSV_HEADER = ["At", "Frame count", "Wire bytes", "Capture parameters", "Outcome", "Notice", "Transcript"];

function csvRow(values: readonly string[]): string {
  return values.map(escapeCsvValue).join(",");
}

export function formatLegibilityProbeLogCsv(log: LegibilityProbeRunLog): string {
  const lines: string[] = [csvRow(RUN_CSV_HEADER)];
  for (const run of log.runs) {
    lines.push(
      csvRow([
        run.at,
        String(run.frameCount),
        String(run.wireBytes),
        run.captureParametersLine,
        run.outcome,
        run.noticeText,
        run.transcript,
      ])
    );
  }
  return lines.join("\r\n");
}

/** The exhaustive JSON export - an OBJECT (never a bare array), same
 * reasoning as formatDiscussionRepliesLogJson/formatGradingRecordingLogJson. */
export function formatLegibilityProbeLogJson(log: LegibilityProbeRunLog, meta: { exportedAt: string }): string {
  return JSON.stringify({ exportedAt: meta.exportedAt, ...log }, null, 2);
}

// ---------------------------------------------------------------------------
// Filename. No course/name segment to slugify - a probe run carries no
// course context (legibility-probe.ts's own header: a one-shot, generic
// instrument) - so this is simpler than the other two logs' filename
// functions rather than reimplementing their unused slugify branch.
// ---------------------------------------------------------------------------

function fileStamp(atIso: string): string {
  const match = atIso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return atIso.replace(/[^0-9a-zA-Z]+/g, "-").replace(/^-+|-+$/g, "");
  const [, year, month, day, hour, minute, second] = match;
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

/** `legibility-probe-log-<YYYYMMDD-HHMMSS>.<ext>`. */
export function legibilityProbeLogFileName(extension: string, atIso: string): string {
  return `legibility-probe-log-${fileStamp(atIso)}.${extension}`;
}
