"use server";

import { repoGradeDurableStartupAvailable } from "@/lib/repo-grades-dashboard/admission-mode";
import type { AutomaticRepoGradeBlocks } from "@/lib/repo-grades-dashboard/automatic-blocks";
import { automaticReasonLabel } from "@/lib/repo-grades-dashboard/automatic-reason-label";
import { isAutomaticRepoGradeId } from "@/lib/repo-grades-dashboard/automatic-store";
import { requireAppOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";

const unavailable = { status: "unavailable" } as const;

/** The gradebook can only read blockers from the latest run that included the owner's class. */
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
    // row cap as unavailable instead of silently hiding some blocked targets.
    const { data, count, error } = await client.from("repo_grade_automatic_targets")
      .select("repo,folder,source_ref,state,reason", { count: "exact" })
      .eq("run_id", run.data.id).eq("course_id", courseId)
      .in("state", ["blocked", "embedded-profile-required"]).order("id").limit(1000).retry(false);
    if (error || !data || data.length !== count) return unavailable;

    return {
      status: "loaded",
      run: {
        id: run.data.id,
        startedAt,
        discoveryExplanation: runCourse.state === "partial" ? automaticReasonLabel(runCourse.reason) : null,
      },
      targets: data.map(({ repo, folder, source_ref, state, reason }) => ({
        repo, folder, sourceRef: source_ref,
        explanation: automaticReasonLabel(state === "embedded-profile-required" ? state : reason),
        runStartedAt: startedAt,
      })),
    };
  } catch {
    return unavailable;
  }
}
