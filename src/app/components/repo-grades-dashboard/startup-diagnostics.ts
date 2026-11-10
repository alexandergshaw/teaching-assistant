import { recordSessionDiagnosticEntry } from "@/lib/session-diagnostic-log";
import type { previewRepoGradeStartupPlanAction } from "@/app/actions/repo-grades-dashboard";
import type { RepoGradePreparationDiagnostic } from "@/lib/repo-grades-dashboard/preparation-runtime";
import type { AutomaticRepoGradeRun } from "@/lib/repo-grades-dashboard/automatic-status";

type Operation = "readiness" | "courses" | "discovery" | "history" | "evaluation" | "stop"
  | "batch_read" | "batch_seal" | "batch_close" | "preview" | "background" | "background_preference" | "background_schedule"
  | "background_retry" | "background_recovery" | "background_start" | "background_stop"
  | "background_github_retry" | "background_github_cooldown" | "background_block_details" | "background_class_queue";
type Outcome = "success" | "unavailable" | "incomplete" | "request-failed" | "failed" | "unknown" | "blocked"
  | "unchanged" | "disabled" | "not-configured" | "embedded-profile-required" | "in-progress" | "stopped";
type PreviewResult = Awaited<ReturnType<typeof previewRepoGradeStartupPlanAction>> | { status: "request-failed" };
type PreviewDetail = {
  discoveryOutcome: "complete" | "incomplete" | "blocked" | "not-configured";
  historyOutcome: "complete" | "unknown" | "not-read";
  targetCount: number;
  incompleteSourceCount?: number;
};
type BackgroundDetail = { courseCount: number; partialCourses: number; blockedTargets: number; partialTargets: number; failedTargets: number; unknownTargets: number; runningTargets: number; queuedTargets: number; notStartedTargets: number; rateLimitReasons: number; timeoutReasons: number; accessReasons: number; configReasons: number; otherReasons: number };

/** Aggregate fixed categories only. Never log course, repository, or explanation text. */
export function backgroundDiagnosticDetail(run: AutomaticRepoGradeRun): BackgroundDetail {
  const result: BackgroundDetail = { courseCount: run.courses.length, partialCourses: 0, blockedTargets: 0, partialTargets: 0, failedTargets: 0, unknownTargets: 0, runningTargets: 0, queuedTargets: 0, notStartedTargets: 0, rateLimitReasons: 0, timeoutReasons: 0, accessReasons: 0, configReasons: 0, otherReasons: 0 };
  const fields = { blocked: "blockedTargets", "embedded-profile-required": "blockedTargets", partial: "partialTargets", failed: "failedTargets", unknown: "unknownTargets", running: "runningTargets", queued: "queuedTargets", "not-started": "notStartedTargets" } as const;
  function countReason(reason: string | null, count: number) {
    if (!reason || !Number.isSafeInteger(count) || count <= 0) return;
    const key = ["rate-limited", "grading-source-rate-limited", "rate-limit-retry-exhausted"].includes(reason) ? "rateLimitReasons"
      : ["deadline-exceeded", "readme-deadline-exceeded", "worker-interrupted"].includes(reason) ? "timeoutReasons"
      : ["access-denied", "forbidden", "owner-unavailable"].includes(reason) ? "accessReasons"
      : ["invalid-configuration", "invalid-settings", "profile-unavailable", "embedded-profile-required", "configuration-changed"].includes(reason) ? "configReasons" : "otherReasons";
    result[key] = Math.min(10000, result[key] + count);
  }
  for (const course of run.courses) {
    if (course.state === "partial") result.partialCourses++;
    countReason(course.reason, 1);
    for (const row of course.counts) {
      const key = fields[row.state as keyof typeof fields];
      if (key && Number.isSafeInteger(row.count) && row.count > 0) result[key] = Math.min(10000, result[key] + row.count);
      countReason(row.reason, row.count);
    }
  }
  result.courseCount = Math.min(10000, result.courseCount);
  result.partialCourses = Math.min(10000, result.partialCourses);
  return result;
}

export function recordRepoGradesStartup(
  operation: Operation,
  outcome: Outcome,
  startedAt: number,
  countOrPreview?: number | PreviewDetail | BackgroundDetail,
) {
  const detail = typeof countOrPreview === "number" ? { itemCount: Math.min(10_000, countOrPreview) } : countOrPreview;
  recordSessionDiagnosticEntry({
    at: new Date().toISOString(),
    surface: "grading",
    operation: `repo_grades_startup_${operation}`,
    outcome: outcome === "success" ? "success" : "failure",
    ...(outcome === "success" ? {} : { cause: outcome }),
    durationMs: Math.min(3_600_000, Math.max(0, Math.round(performance.now() - startedAt))),
    ...(detail === undefined ? {} : { detail }),
  });
}

export function recordRepoGradesStartupPreview(result: PreviewResult, startedAt: number) {
  try {
    if (result.status !== "preview") {
      const outcome = result.status === "request-failed" ? "request-failed"
        : result.status === "discovery-disabled" ? "disabled" : "unavailable";
      recordRepoGradesStartup("preview", outcome, startedAt);
      return;
    }
    const { discovery, history, targetCount } = result;
    const discoveryOutcome = discovery.status !== "scanned" ? discovery.status
      : !discovery.enumerationComplete || discovery.incompleteSources > 0 ? "incomplete" : "complete";
    const outcome = discoveryOutcome !== "complete" ? discoveryOutcome : history === "unknown" ? "unknown" : "success";
    recordRepoGradesStartup("preview", outcome, startedAt, {
      discoveryOutcome,
      historyOutcome: history,
      targetCount: Math.min(10_000, targetCount),
      ...(discovery.status === "scanned" && { incompleteSourceCount: Math.min(10_000, discovery.incompleteSources) }),
    });
  } catch {
    // A diagnostic failure must not prevent the preview from opening.
  }
}

export function recordRepoGradesStartupPreparation(
  { status, durationMs }: Omit<RepoGradePreparationDiagnostic, "status"> & {
    status: RepoGradePreparationDiagnostic["status"] | "request-failed";
  },
  operation: "repo_grades_startup_preparation" | "repo_grades_startup_preparation_retry" = "repo_grades_startup_preparation",
) {
  recordSessionDiagnosticEntry({
    at: new Date().toISOString(),
    surface: "grading",
    operation,
    outcome: status === "ready" ? "success" : "failure",
    ...(status === "ready" ? {} : { cause: status }),
    durationMs,
  });
}
