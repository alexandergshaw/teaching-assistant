"use server";

import type { CanvasQueueItem } from "@/lib/canvas";
import { listGradingQueue, getNeedsGradingCount, getUnreadCount } from "@/lib/canvas";
import { requireOwner } from "@/lib/supabase/auth";
import { listDismissals, addDismissal, removeDismissal } from "@/lib/grading-dismissals";

/**
 * Build the grading queue across the given institution acronyms: assignments and
 * graded discussions that currently have submissions needing grading, with their
 * description and rubric. Per-institution failures are reported, not fatal.
 */
export async function listGradingQueueAction(
  acronyms: string[]
): Promise<
  { rows: CanvasQueueItem[]; errors: Array<{ acronym: string; error: string }> } | { error: string }
> {
  try {
    await requireOwner();
    const rows: CanvasQueueItem[] = [];
    const errors: Array<{ acronym: string; error: string }> = [];
    await Promise.all(
      acronyms.map(async (raw) => {
        const code = raw.trim().toUpperCase();
        if (!code) return;
        try {
          rows.push(...(await listGradingQueue(code)));
        } catch (err) {
          errors.push({
            acronym: code,
            error: err instanceof Error ? err.message : "Failed to load.",
          });
        }
      })
    );
    rows.sort(
      (a, b) =>
        a.institution.localeCompare(b.institution) ||
        a.courseName.localeCompare(b.courseName) ||
        a.title.localeCompare(b.title)
    );
    return { rows, errors };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the grading queue." };
  }
}

/**
 * Per-institution notification counts for the tab + switcher badges: submissions
 * needing grading and unread inbox messages. Per-institution failures degrade to
 * 0 so one misconfigured school doesn't blank every badge.
 */
/** The user's seen assignments and unwatched courses, for filtering the feed. */
export async function listGradingDismissalsAction(): Promise<
  | {
      assignments: Array<{ institution: string; refId: string }>;
      courses: Array<{ institution: string; refId: string }>;
    }
  | { error: string }
> {
  try {
    const user = await requireOwner();
    const all = await listDismissals(user.id);
    return {
      assignments: all
        .filter((d) => d.scope === "assignment")
        .map((d) => ({ institution: d.institution, refId: d.refId })),
      courses: all
        .filter((d) => d.scope === "course")
        .map((d) => ({ institution: d.institution, refId: d.refId })),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load your grading preferences." };
  }
}

/** Mark an assignment seen (hide it from the feed/badge), or undo that. */
export async function setAssignmentSeenAction(
  institution: string,
  assignmentId: string,
  seen: boolean
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const code = institution.trim().toUpperCase();
    if (seen) await addDismissal(user.id, "assignment", code, assignmentId);
    else await removeDismissal(user.id, "assignment", code, assignmentId);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the assignment." };
  }
}

/** Stop watching a course (no more notifications for it), or resume watching. */
export async function setCourseWatchedAction(
  institution: string,
  courseId: string,
  watched: boolean
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const code = institution.trim().toUpperCase();
    // "not watched" is stored as a 'course' dismissal.
    if (!watched) await addDismissal(user.id, "course", code, courseId);
    else await removeDismissal(user.id, "course", code, courseId);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the course." };
  }
}

export async function getInstitutionCountsAction(
  acronyms: string[]
): Promise<
  { counts: Array<{ acronym: string; needsGrading: number; unread: number }> } | { error: string }
> {
  try {
    const user = await requireOwner();
    // Exclude assignments marked "seen" and courses the user stopped watching so
    // the badge matches the filtered Live Feed.
    const dismissals = await listDismissals(user.id);
    const assignmentsByCode = new Map<string, Set<string>>();
    const coursesByCode = new Map<string, Set<string>>();
    for (const d of dismissals) {
      const map = d.scope === "assignment" ? assignmentsByCode : coursesByCode;
      const set = map.get(d.institution) ?? new Set<string>();
      set.add(d.refId);
      map.set(d.institution, set);
    }
    const counts = await Promise.all(
      acronyms.map(async (raw) => {
        const code = raw.trim().toUpperCase();
        if (!code) return { acronym: code, needsGrading: 0, unread: 0 };
        const exclude = {
          courses: coursesByCode.get(code),
          assignments: assignmentsByCode.get(code),
        };
        const [needsGrading, unread] = await Promise.all([
          getNeedsGradingCount(code, exclude).catch(() => 0),
          getUnreadCount(code).catch(() => 0),
        ]);
        return { acronym: code, needsGrading, unread };
      })
    );
    return { counts };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load notification counts." };
  }
}

/**
 * Unread inbox counts only — cheap (one call per school), for refreshing the
 * Communications badge after read/archive without re-running the needs-grading scan.
 */
export async function getUnreadCountsAction(
  acronyms: string[]
): Promise<{ counts: Array<{ acronym: string; unread: number }> } | { error: string }> {
  try {
    await requireOwner();
    const counts = await Promise.all(
      acronyms.map(async (raw) => {
        const code = raw.trim().toUpperCase();
        if (!code) return { acronym: code, unread: 0 };
        const unread = await getUnreadCount(code).catch(() => 0);
        return { acronym: code, unread };
      })
    );
    return { counts };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load unread counts." };
  }
}
