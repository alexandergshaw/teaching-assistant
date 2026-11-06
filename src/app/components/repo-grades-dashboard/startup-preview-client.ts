import { previewRepoGradeStartupPlanAction } from "@/app/actions/repo-grades-dashboard";
import { recordRepoGradesStartupPreview } from "./startup-diagnostics";

export async function loadRepoGradesStartupPreview(courseId: string, accountId: string) {
  const startedAt = performance.now();
  const result = await previewRepoGradeStartupPlanAction(courseId, accountId)
    .catch(() => ({ status: "request-failed" } as const));
  recordRepoGradesStartupPreview(result, startedAt);
  return result.status === "request-failed" ? { status: "course-unavailable" } as const : result;
}
