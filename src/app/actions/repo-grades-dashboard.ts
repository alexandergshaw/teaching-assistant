"use server";

import { planRepoGradeCourse } from "@/lib/repo-grades-dashboard/runner";
import { requireAppOwner } from "@/lib/supabase/auth";
import { readRepoGradeHistoryForOwner, REPO_GRADE_HISTORY_PAGE_SIZE } from "@/lib/repo-grades-dashboard/ledger";
import { createRepoGradeStartupSchedule } from "@/lib/repo-grades-dashboard/scheduler";
import { readRepoGradeStartupCourses } from "@/lib/repo-grades-dashboard/startup-courses";
import { readRepoGradeStartupHistory } from "@/lib/repo-grades-dashboard/startup-history";

function validCourseId(courseId: unknown): courseId is string {
  return typeof courseId === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(courseId);
}

/** Read the startup course inventory for the account that opened the view. */
export async function readRepoGradeStartupCoursesAction(expectedAccountId: unknown) {
  const owner = await requireAppOwner().catch(() => null);
  if (!owner || owner.id !== expectedAccountId) {
    return { status: "unknown", reason: "account-unavailable" } as const;
  }
  return readRepoGradeStartupCourses(owner.id);
}

/** Read-only startup preview for one owned course. */
export async function planRepoGradeCourseAction(courseId: string) {
  const owner = await requireAppOwner();
  if (!validCourseId(courseId)) {
    return { status: "course-unavailable" } as const;
  }
  try {
    const plan = await planRepoGradeCourse(owner.id, courseId.toLowerCase());
    if (!plan) return { status: "course-unavailable" } as const;
    const scope = { accountId: owner.id, generation: "preview" };
    const inventories = [{
      accountId: plan.accountId, courseId: plan.courseId,
      organization: plan.courseConfig.github_org, discovery: plan.discovery,
    }];
    const inventory = createRepoGradeStartupSchedule(scope, inventories, new Map(), false);
    const targets = [...inventory.work.values()].map(({ target }) => target);
    const history = targets.length ? await readRepoGradeStartupHistory(owner.id, plan.courseId, targets) : null;
    const preview = history ? createRepoGradeStartupSchedule(scope, inventories, history, false) : inventory;
    return {
      status: "planned",
      discovery: plan.discovery,
      execution: "runtime-unavailable",
      preview: {
        history: history ? "complete" : targets.length ? "unknown" : "not-read",
        targets: [...preview.work.values()].map(({ target, state }) => ({
          repo: target.repo, sourceRef: target.sourceRef, commit: target.sha, folder: target.folder, state,
        })),
      },
    } as const;
  } catch {
    return { status: "storage-unavailable" } as const;
  }
}

/** Read-only attempt history. An account change between rendering and sending
 * the request must not substitute the newly authenticated account's data. */
export async function readRepoGradeHistoryAction(courseId: string, expectedAccountId: string, before?: number) {
  const owner = await requireAppOwner();
  if (owner.id !== expectedAccountId || !validCourseId(courseId)
    || (before !== undefined && (!Number.isSafeInteger(before) || before <= 0))) {
    return { status: "course-unavailable" } as const;
  }
  try {
    const rows = await readRepoGradeHistoryForOwner(owner.id, courseId, before);
    if (!rows) return { status: "course-unavailable" } as const;
    return {
      status: "loaded",
      // A full page might be the last page. Only a short read proves the end.
      nextBefore: rows.length === REPO_GRADE_HISTORY_PAGE_SIZE ? rows.at(-1)!.generation : null,
      rows: rows.map((row) => ({
        generation: row.generation,
        repo: row.repo,
        folder: row.folder,
        sourceRef: row.source_ref,
        commit: row.source_sha,
        profileFingerprint: row.profile_fingerprint,
        status: row.status,
        claimedAt: new Date(row.claimed_at).toISOString(),
        settledAt: row.settled_at === null ? null : new Date(row.settled_at).toISOString(),
        score: row.score,
        feedback: row.feedback,
        feedback_sections: row.feedback_sections ?? null,
        feedback_retention: row.feedback_retention ?? null,
        rubric: row.rubric,
      })),
    } as const;
  } catch {
    return { status: "storage-unavailable" } as const;
  }
}
