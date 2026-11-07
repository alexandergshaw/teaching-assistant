"use server";

import { repoGradeDurableStartupAvailable } from "@/lib/repo-grades-dashboard/admission-mode";
import { AUTOMATIC_GRADE_DETAIL_STATES, type AutomaticRepoGradeBlocks } from "@/lib/repo-grades-dashboard/automatic-blocks";
import { automaticReasonLabel } from "@/lib/repo-grades-dashboard/automatic-reason-label";
import { readmeExampleLabel } from "@/lib/repo-grades-dashboard/readme-example-label";
import { isAutomaticRepoGradeId } from "@/lib/repo-grades-dashboard/automatic-store";
import { requireAppOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";

const unavailable = { status: "unavailable" } as const;
type EmptyTarget = { repo: string; folder: string; source_ref: string; source_sha: string; run_started_at: string;
  observed_source_ref: string; observed_source_sha: string; observed_state: string; observed_run_started_at: string; reason: string | null };
function emptyTarget(value: unknown): value is EmptyTarget {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.repo === "string" && typeof row.folder === "string" && typeof row.source_ref === "string"
    && typeof row.source_sha === "string" && /^[0-9a-f]{40}$/.test(row.source_sha)
    && typeof row.run_started_at === "string" && Number.isFinite(Date.parse(row.run_started_at))
    && typeof row.observed_source_ref === "string" && typeof row.observed_source_sha === "string"
    && /^[0-9a-f]{40}$/.test(row.observed_source_sha)
    && typeof row.observed_state === "string" && /^[a-z-]{1,32}$/.test(row.observed_state)
    && (row.reason === null || typeof row.reason === "string")
    && typeof row.observed_run_started_at === "string" && Number.isFinite(Date.parse(row.observed_run_started_at));
}

/** The gradebook can only read target problems from the latest run that included the owner's class. */
export async function readRepoGradeAutomaticBlocksAction(
  expectedAccountId: unknown, courseId: unknown,
): Promise<AutomaticRepoGradeBlocks> {
  if (!repoGradeDurableStartupAvailable() || !isAutomaticRepoGradeId(courseId)) {
    return unavailable;
  }
  const owner = await requireAppOwner().catch(() => null);
  if (!owner || owner.id !== expectedAccountId) return unavailable;

  try {
    const client = createServiceClient();
    const [run, course] = await Promise.all([
      client.from("repo_grade_automatic_runs").select("id,created_at,repo_grade_automatic_courses!inner(state,reason)")
        .eq("user_id", owner.id).eq("repo_grade_automatic_courses.course_id", courseId)
        .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle().retry(false),
      client.from("course_hub").select("id").eq("id", courseId).eq("user_id", owner.id).maybeSingle().retry(false),
    ]);
    if (run.error || course.error || !course.data) return unavailable;
    if (!run.data) return { status: "loaded", run: null, targets: [] };
    const [runCourse] = run.data.repo_grade_automatic_courses;
    const startedAt = run.data.created_at;
    if (!runCourse || !Number.isFinite(Date.parse(startedAt))) return unavailable;

    // The worker stages at most 1,000 targets per course. Treat a lower API
    // row cap as unavailable instead of silently hiding some target reasons.
    const { data, count, error } = await client.from("repo_grade_automatic_targets")
      .select("repo,folder,source_ref,state,reason,readme_example", { count: "exact" })
      .eq("run_id", run.data.id).eq("course_id", courseId)
      .in("state", AUTOMATIC_GRADE_DETAIL_STATES).order("id").limit(1000).retry(false);
    if (error || !data || data.length !== count) return unavailable;
    const empty = await client.rpc("repo_grade_latest_no_submission_targets", {
      p_user_id: owner.id, p_course_id: courseId,
    }).retry(false);
    if (empty.error || !empty.data || typeof empty.data !== "object" || Array.isArray(empty.data)) return unavailable;
    const emptyResult = empty.data as Record<string, unknown>;
    if (!Number.isSafeInteger(emptyResult.total) || (emptyResult.total as number) < 0 || (emptyResult.total as number) > 1000
      || !Array.isArray(emptyResult.targets) || emptyResult.targets.length !== emptyResult.total
      || !emptyResult.targets.every(emptyTarget)) return unavailable;

    return {
      status: "loaded",
      run: {
        id: run.data.id,
        startedAt,
        discoveryExplanation: runCourse.state === "partial" ? automaticReasonLabel(runCourse.reason) : null,
      },
      targets: [...data.filter(({ state }) => state !== "no-submission").map(({ repo, folder, source_ref, state, reason, readme_example }) => ({
        repo, folder, sourceRef: source_ref,
        explanation: automaticReasonLabel(state === "embedded-profile-required" ? state : reason)
          + readmeExampleLabel(reason, readme_example),
        ...(state === "partial" && { partial: true as const }),
        runStartedAt: startedAt,
      })), ...emptyResult.targets.map(({ repo, folder, source_ref, source_sha, run_started_at, observed_source_ref,
        observed_source_sha, observed_state, observed_run_started_at, reason }) => ({
        repo, folder, sourceRef: source_ref, sourceSha: source_sha, explanation: "No submission.",
        observedSourceSha: observed_source_sha, observedState: observed_state, observedRunStartedAt: observed_run_started_at,
        ...((observed_source_sha !== source_sha || observed_source_ref !== source_ref) && { noSubmissionStale: true as const }),
        ...(reason === "verified-empty-explicit" && { noSubmissionExplicit: true as const }),
        noSubmission: true as const, runStartedAt: run_started_at,
      }))],
    };
  } catch {
    return unavailable;
  }
}
