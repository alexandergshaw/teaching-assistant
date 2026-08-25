// Per-repo run record for the workflow repo-grading paths (`grade-repo`,
// `batch-grade-repos-to-draft`), attended and cron alike
// (docs/repo-grading-records-acceptance-criteria.md, section R1).
//
// R1.1: a `grading_drafts` row lists only the repos that produced a grade -
// it cannot answer "what did not make it in, and why" after an unattended
// batch. gradeTileRepos/gradeOrgRepos (steps.grading-repos.helpers.ts)
// already classify every skip and failure (no matching week/assignment
// folder, an unresolved binding, a fetch failure, a model error) - those
// reasons were being built into per-run display notes and then discarded.
// This module is where that same reason text is assembled into a durable,
// structured record instead: one entry per repo ATTEMPTED (R1.2), never one
// per repo graded.
//
// Pure, no I/O, no clock: every function here takes the timestamp it needs
// as a parameter rather than calling Date.now(), so a test pins an exact
// rendered report/CSV/JSON rather than asserting around "now" - the same
// posture src/app/components/repo-grades/repoGradesLog.ts already takes (see
// that file's own header), though this module is NOT that one: this covers
// the workflow steps' run record, not the Repo Grades view's activity log,
// and the two are intentionally not shared code (different shapes,
// different lifetimes - a workflow run's record lives on a grading_drafts
// row and/or a Markdown deliverable file, not localStorage).
//
// vitest here is node-env and collects only src/**/*.test.ts, so nothing
// rendered is ever exercised by a test - which is exactly why every
// formatting/aggregation decision (entry shape, counts, the CSV/JSON
// serialisation, the Markdown report body) lives in this module rather than
// in the step's own run() closures.

import { escapeCsvValue } from "@/lib/course-tasks-view-csv";

/** R1.2: what happened to one attempted repo. A repo the run never reached
 * is not an entry at all (see `notReached` on RepoGradingRunLog below) -
 * this type only describes an attempt that FINISHED. */
export type RepoGradingOutcome = "graded" | "skipped" | "failed";

const REPO_GRADING_OUTCOMES: readonly RepoGradingOutcome[] = ["graded", "skipped", "failed"];

/** One repo's finished attempt. Every field is a plain string and always
 * present - `reason`/`score` are `""` when they do not apply (a graded repo
 * has no reason; a skipped/failed repo usually has no score) - never
 * undefined, so a CSV/JSON writer emits one column per field unconditionally
 * without a later field silently shifting columns on rows that omitted it
 * (the same discipline repoGradesLog.ts's own RepoGradeLogEntry documents,
 * though that is a different, UI-local type - see this file's header). */
export interface RepoGradingLogEntry {
  repo: string;
  outcome: RepoGradingOutcome;
  reason: string;
  score: string;
  /** ISO 8601, supplied by the caller - see this file's header. */
  at: string;
}

/** The whole run's record: every repo attempted, plus R1.5's distinction
 * between "these repos were attempted" and "the run ended before reaching
 * the rest" - silence about the remainder reads as "there were none", so a
 * cut-off run (the unattended step's own time budget, or an uncaught throw)
 * must say so explicitly via `truncated`/`notReached` rather than simply
 * having fewer entries. */
export interface RepoGradingRunLog {
  entries: RepoGradingLogEntry[];
  attempted: number;
  /** R1.5: true when the run ended before reaching every repo it intended
   * to. */
  truncated: boolean;
  /** Repos the run intended but never reached, when known. Empty whenever
   * `truncated` is false - a complete run has no "rest" to name. */
  notReached: string[];
}

/** Human labels for the Markdown report and the CSV's `Outcome` column - the
 * exported files are read by a person reconstructing a grading run, not by
 * this app (nothing here ever imports a report/CSV back in), so the label
 * carries the meaning, not the raw `RepoGradingOutcome` string. */
export const REPO_GRADING_OUTCOME_LABELS: Readonly<Record<RepoGradingOutcome, string>> = {
  graded: "Graded",
  skipped: "Skipped",
  failed: "Failed",
};

/** Builds one entry. A thin constructor rather than a bare object literal at
 * every call site so every caller (gradeTileRepos, gradeOrgRepos, and the
 * single-repo grade-repo path) produces the exact same shape - `reason` and
 * `score` default to `""`, matching the "always present, never undefined"
 * rule above. */
export function buildRepoGradingLogEntry(opts: {
  repo: string;
  outcome: RepoGradingOutcome;
  reason?: string;
  score?: string;
  at: string;
}): RepoGradingLogEntry {
  return {
    repo: opts.repo,
    outcome: opts.outcome,
    reason: opts.reason ?? "",
    score: opts.score ?? "",
    at: opts.at,
  };
}

/** Assembles a run's entries into the record above. `entries` is used
 * as-is (in the order attempted, oldest first) - this never reorders or
 * drops anything it is given, which is exactly the property the sabotage
 * check in this module's test file exists to pin down: a caller that
 * silently stops pushing an entry for a skipped repo would still produce a
 * log here, just a wrong (too-short) one, which is why the wrongness has to
 * be caught at the call site, not hidden by this function quietly
 * "fixing" it. */
export function buildRepoGradingRunLog(
  entries: RepoGradingLogEntry[],
  opts?: { truncated?: boolean; notReached?: string[] }
): RepoGradingRunLog {
  return {
    entries,
    attempted: entries.length,
    truncated: opts?.truncated ?? false,
    notReached: opts?.notReached ?? [],
  };
}

export interface RepoGradingRunLogSummary {
  attempted: number;
  graded: number;
  skipped: number;
  failed: number;
  notReachedCount: number;
  truncated: boolean;
}

/** The counts a report/UI would show. Mirrors summarizeRepoGradeLog's
 * counting style (repoGradesLog.ts) but over this module's own entry shape -
 * `graded + skipped + failed` always equals `attempted` by construction,
 * since every entry has exactly one outcome. */
export function summarizeRepoGradingRunLog(log: RepoGradingRunLog): RepoGradingRunLogSummary {
  let graded = 0;
  let skipped = 0;
  let failed = 0;
  for (const entry of log.entries) {
    if (entry.outcome === "graded") graded += 1;
    else if (entry.outcome === "skipped") skipped += 1;
    else failed += 1;
  }
  return {
    attempted: log.attempted,
    graded,
    skipped,
    failed,
    notReachedCount: log.notReached.length,
    truncated: log.truncated,
  };
}

const CSV_HEADER = ["Repo", "Outcome", "Reason", "Score", "At"];

/**
 * R1.6's CSV, built here (not in the download-button component) so the
 * escaping is unit-testable: one header row, one row per attempted entry
 * (oldest first), then - only when the run was cut short - one trailing row
 * per not-reached repo, so a downloaded CSV never silently implies "the run
 * covered everything". Every field goes through escapeCsvValue
 * (src/lib/course-tasks-view-csv.ts) rather than a new local escaper, so a
 * reason/score containing a comma, a quote, or a newline cannot corrupt the
 * file - the same reuse repoGradesLog.ts's own formatRepoGradeLogCsv
 * documents (a different, UI-local formatter - see this file's header),
 * and REGRESSION entry 267 check 4 / entry 333's own reuse of the same
 * escaper. Rows are joined with \r\n, matching both of those.
 */
export function formatRepoGradingLogCsv(log: RepoGradingRunLog): string {
  const rows = [CSV_HEADER.map(escapeCsvValue).join(",")];
  for (const entry of log.entries) {
    rows.push(
      [entry.repo, REPO_GRADING_OUTCOME_LABELS[entry.outcome], entry.reason, entry.score, entry.at]
        .map(escapeCsvValue)
        .join(",")
    );
  }
  if (log.truncated) {
    for (const repo of log.notReached) {
      rows.push(
        [repo, "Not reached", "The run ended before reaching this repo.", "", ""].map(escapeCsvValue).join(",")
      );
    }
  }
  return rows.join("\r\n");
}

/** R1.6's JSON export: an OBJECT, never a bare array, so a later field can
 * be added without breaking anything already parsing these files - the same
 * reasoning formatRepoGradeLogJson (repoGradesLog.ts) gives for its own
 * shape. `exportedAt` is a parameter for the same reason every other
 * timestamp in this module is - see this file's header. */
export function formatRepoGradingLogJson(
  log: RepoGradingRunLog,
  meta: { exportedAt: string }
): string {
  return JSON.stringify(
    {
      exportedAt: meta.exportedAt,
      attempted: log.attempted,
      truncated: log.truncated,
      notReached: log.notReached,
      entries: log.entries,
    },
    null,
    2
  );
}

/**
 * R1.4's Markdown report body: an unattended run persists this through the
 * existing `saveRecordingFile` deliverable path so a run that graded NOTHING
 * (every repo skipped) still leaves a trace, which is precisely the run a
 * `grading_drafts` row cannot represent (R1.1). Built here, pure, so vitest
 * can reach the exact wording without going through saveRecordingFile at
 * all. Lists every attempted entry (outcome, reason, score), then - only
 * when truncated - a trailing section naming every not-reached repo, so
 * silence about the remainder never reads as "there were none" (R1.5).
 */
export function buildRepoGradingReportMarkdown(
  log: RepoGradingRunLog,
  meta: { title: string; generatedAt: string }
): string {
  const summary = summarizeRepoGradingRunLog(log);
  const lines: string[] = [
    `# ${meta.title}`,
    "",
    `Generated ${meta.generatedAt}`,
    "",
    `Attempted ${summary.attempted} repo(s): ${summary.graded} graded, ${summary.skipped} skipped, ${summary.failed} failed.`,
    "",
  ];

  for (const entry of log.entries) {
    const parts = [`**${entry.repo}**: ${REPO_GRADING_OUTCOME_LABELS[entry.outcome]}`];
    if (entry.score) parts.push(`score ${entry.score}`);
    if (entry.reason) parts.push(entry.reason);
    lines.push(`- ${parts.join(" - ")}`);
  }

  if (log.truncated) {
    lines.push(
      "",
      `The run ended before reaching ${log.notReached.length} more repo(s):`
    );
    for (const repo of log.notReached) {
      lines.push(`- ${repo}`);
    }
  }

  return lines.join("\n");
}

/** Lowercased, non-alphanumerics collapsed to single dashes, ends trimmed -
 * mirrors repoGradesLog.ts's own slugifyCourseName, reimplemented here (not
 * imported - that module is Repo Grades view-specific, see this file's
 * header) since a report filename needs the same "always a valid filename"
 * treatment. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "2026-08-24T15:04:05.123Z" -> "20260824-150405". Colons and dots are not
 * safe in a Windows filename, and the sub-second part carries no information
 * a human reading a filename wants - mirrors repoGradesLog.ts's own
 * fileStamp for the same reason (see slugify above). */
function fileStamp(atIso: string): string {
  const match = atIso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return atIso.replace(/[^0-9a-zA-Z]+/g, "-").replace(/^-+|-+$/g, "");
  const [, year, month, day, hour, minute, second] = match;
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

/** `repo-grading-log-<name-slug>-<YYYYMMDD-HHMMSS>.<ext>`. A name that slugs
 * to nothing (blank, or punctuation only) drops that segment entirely rather
 * than emitting a dangling double dash, so the result is always a valid,
 * non-empty filename - same rule as repoGradesLog.ts's own
 * repoGradeLogFileName. */
export function repoGradingLogFileName(name: string, extension: string, atIso: string): string {
  const slug = slugify(name);
  const parts = ["repo-grading-log", slug, fileStamp(atIso)].filter((part) => part !== "");
  return `${parts.join("-")}.${extension}`;
}

// ---------------------------------------------------------------------------
// Defensive parsing (never trust stored data) - used by grading-drafts.ts to
// coerce a grading_drafts row's jsonb payload back into a RepoGradingRunLog,
// dropping anything malformed rather than throwing, exactly like this
// codebase's other draft/localStorage coercers (coerceGradingDraftPayload in
// grading-drafts.ts itself, parseRepoGradeLogEntries in repoGradesLog.ts).
// ---------------------------------------------------------------------------

function coerceOutcome(value: unknown): RepoGradingOutcome | null {
  return typeof value === "string" && (REPO_GRADING_OUTCOMES as readonly string[]).includes(value)
    ? (value as RepoGradingOutcome)
    : null;
}

function coerceEntry(raw: unknown): RepoGradingLogEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const outcome = coerceOutcome(o.outcome);
  if (typeof o.repo !== "string" || !outcome) return null;
  return {
    repo: o.repo,
    outcome,
    reason: typeof o.reason === "string" ? o.reason : "",
    score: typeof o.score === "string" ? o.score : "",
    at: typeof o.at === "string" ? o.at : "",
  };
}

/** Coerces an untyped jsonb value into a RepoGradingRunLog, or `undefined`
 * when the value is not a plausible log at all (absent, wrong type) - a
 * hand-edited or partially-written row degrades to fewer/no entries, never a
 * crash, mirroring coerceGradingDraftPayload's own posture in the same
 * grading-drafts.ts module this feeds. */
export function coerceRepoGradingRunLog(value: unknown): RepoGradingRunLog | undefined {
  if (!value || typeof value !== "object") return undefined;
  const o = value as Record<string, unknown>;
  const entries = Array.isArray(o.entries)
    ? o.entries.map(coerceEntry).filter((e): e is RepoGradingLogEntry => e !== null)
    : [];
  const notReached = Array.isArray(o.notReached)
    ? o.notReached.filter((s): s is string => typeof s === "string")
    : [];
  return {
    entries,
    attempted: typeof o.attempted === "number" ? o.attempted : entries.length,
    truncated: !!o.truncated,
    notReached,
  };
}
