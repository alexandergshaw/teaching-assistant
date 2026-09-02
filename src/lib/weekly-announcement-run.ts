// Split out of src/app/actions/canvas-inbox.ts purely to stay under the
// repo-wide 1000-line ceiling (src/file-size-ceiling.structure.test.ts) -
// canvas-inbox.ts was at exactly 1000 lines with no room left. This is a
// PURE EXTRACTION: no behavior changed, nothing renamed, no call signature
// altered. Same split idiom as discussion-serialization.ts and
// takeAnnouncementTranscription.ts (see their own header comments) - a
// cohesive sub-operation moved to its own leaf, imported back by its one
// caller.
//
// canvas-inbox.ts carries "use server", which may export only async
// functions - a "use server" file that re-exports a TYPE from elsewhere
// compiles clean under tsc but fails at `next build`. The types below are
// therefore NOT re-exported from canvas-inbox.ts (nothing in the repo
// imports them by name from there today - verified by a repo-wide grep
// before this split); canvas-inbox.ts only imports them for its own
// function signatures. Anything that needs them going forward should import
// from this file directly.
//
// loadWeeklyAnnouncementPlan runs a Supabase read (listScheduledAnnouncementRows)
// and a Canvas read (listAnnouncements) - it is NOT fetch-free, so it must
// not live in src/lib/announcement-schedule.ts, which documents itself as
// deliberately synchronous/side-effect-free so it stays safe to import from
// a client-bundled workflow registry step.

import { listAnnouncements, type CanvasAnnouncement } from "@/lib/canvas";
import { createServiceClient } from "@/lib/supabase/server";
import {
  listScheduledAnnouncementRows,
  type ScheduledAnnouncementRow,
} from "@/lib/supabase/weekly-announcement-schedule";
import {
  planAnnouncements,
  type AnnouncementSlot,
  type AnnouncementPlanEntry,
  type ExistingAnnouncementRow,
} from "@/lib/announcement-schedule";

/** One week's outcome after this run actually attempted it (or chose not
 * to) - distinct from planAnnouncements' own PLANNED action, since
 * execution can diverge from the plan (a "create" can fail; a
 * "resolve-pending" splits into "found the existing one" vs "had to create
 * it after all"). */
export type AnnouncementScheduleOutcome =
  | "created"
  | "already-present"
  | "skipped-past"
  | "rescheduled"
  | "left-posted"
  | "resolved-existing"
  | "resolved-created"
  | "failed"
  | "not-attempted";

export interface AnnouncementScheduleWeekResult {
  week: number;
  outcome: AnnouncementScheduleOutcome;
  detail: string;
}

export interface AnnouncementScheduleRunResult {
  weeks: AnnouncementScheduleWeekResult[];
  createdCount: number;
  resolvedCreatedCount: number;
  rescheduledCount: number;
  alreadyPresentCount: number;
  skippedPastCount: number;
  failedCount: number;
  /** True when at least one desired week was left for a re-run - either the
   * execution time budget fired between weeks, or a week's draft was
   * deferred for the drafting time budget (AC2 item 11a). Both leave real
   * work undone, so both are reported the same way: drives the step's
   * summary line telling the instructor to re-run. */
  stoppedEarly: boolean;
  /** Every week's status + detail (AC9 item 31), plus the standing
   * break-weeks-not-excluded disclosure (AC9 item 32) - see
   * formatWeekOutcomeReport, src/lib/announcement-schedule.ts. */
  report: string;
  /** Same content as `report`, split into lines - convenient for a step's
   * "list" summary kind. */
  lines: string[];
}

// This action's OWN write budget, used when nothing drafted before it ran
// (template mode, or a first module-mode run whose plan needed no drafts at
// all). Comfortably under this app's 60-second Vercel Hobby maxDuration WHEN
// THIS ACTION IS THE ONLY THING RUNNING IN THAT WINDOW - true for an
// ATTENDED run, where each server action gets its own request/window, but
// NOT for the step as a whole in an UNATTENDED run (see
// DRAFTED_RUN_WRITE_BUDGET_MS below). Checked before EACH week (AC5 item
// 21), so the run stops cleanly BETWEEN weeks, never mid-week. The mapping
// table is the checkpoint (AC5 item 20): the next run resumes from whatever
// is left un-confirmed, with no separate continuation token.
export const RUN_TIME_BUDGET_MS = 45_000;

// DEFECT 3 fix: an UNATTENDED run has no per-step deadline - server-runner.ts
// checks its deadline only BETWEEN fan-out groups, never inside a step - so
// plan + draft + schedule all execute inside ONE function whose cap is 60
// seconds (src/app/api/cron/run-schedules/route.ts: maxDuration = 60, with a
// 50-second soft deadline covering the whole tick). Drafting's own budget
// (weekly-announcement-drafting.ts's DEFAULT_DRAFTING_BUDGET_MS, 25s) has
// already spent part of that window by the time this action runs, so
// stacking the full 45s write budget on top (25 + 45 = 70s) exceeds the cap
// mid-week. `runOptions.drafts` being supplied is the signal that drafting
// already ran, so that path uses this smaller budget instead, leaving
// headroom under the 60s cap. Template mode never drafted anything, so it
// keeps the original 45s above.
export const DRAFTED_RUN_WRITE_BUDGET_MS = 30_000;

/**
 * DEFECT 2 fix: loadWeeklyAnnouncementPlan below runs a Supabase read
 * (listScheduledAnnouncementRows) and a Canvas read (listAnnouncements) in
 * the same helper. Only the Canvas half is documented to degrade into a
 * per-week "failed" report (entry 236 check 24) - a Supabase outage must
 * still surface as a plain `{ error }`. Tagging the Canvas failure with this
 * type is what lets scheduleWeeklyAnnouncementsAction's catch tell the two
 * apart without loadWeeklyAnnouncementPlan itself needing to know which
 * shape its caller degrades into.
 */
export class CanvasReadBackError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : "Could not read back existing announcements from Canvas.");
    this.name = "CanvasReadBackError";
  }
}

/**
 * The shared "load rows, read back postedAt, plan" sequence both
 * scheduleWeeklyAnnouncementsAction and planWeeklyAnnouncementsAction run
 * (AC1 item 6 of the module-content acceptance criteria) - factored out so
 * the dry-run planner and the real executor can never silently drift apart
 * on how a week's action is decided. NEVER writes anything; may throw - a
 * Supabase failure surfaces as-is, a Canvas read-back failure surfaces as a
 * CanvasReadBackError - and each caller handles that in its own way since
 * they have different result shapes to degrade into.
 */
export async function loadWeeklyAnnouncementPlan(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  hubCourseId: string,
  courseUrl: string,
  acronym: string | undefined,
  slots: AnnouncementSlot[],
  now: Date
): Promise<{
  storedRows: ScheduledAnnouncementRow[];
  liveAnnouncements: CanvasAnnouncement[];
  plan: AnnouncementPlanEntry[];
}> {
  const storedRows = await listScheduledAnnouncementRows(supabase, userId, hubCourseId);

  // AC3 item 12b: read Canvas-sourced postedAt for every row that already
  // carries a topic id, BEFORE planning - the mapping table itself never
  // learns whether Canvas has posted (the write-ahead insert always commits
  // first). Paginated (AC4): a long term can carry more than one page of
  // announcements. Skipped entirely when there is nothing to check against
  // (a first-ever run has no stored rows at all).
  const topicIds = new Set(
    storedRows.filter((r): r is typeof r & { topicId: number } => r.topicId !== null).map((r) => r.topicId)
  );
  const needsReadBack = topicIds.size > 0 || storedRows.some((r) => r.status === "pending");

  let liveAnnouncements: CanvasAnnouncement[] = [];
  if (needsReadBack) {
    // Tagged so scheduleWeeklyAnnouncementsAction's catch can degrade THIS
    // failure to a per-week report without also swallowing a failure from
    // the listScheduledAnnouncementRows call above (DEFECT 2).
    try {
      liveAnnouncements = await listAnnouncements(courseUrl, acronym, { allPages: true });
    } catch (err) {
      throw new CanvasReadBackError(err);
    }
  }

  const postedById = new Map(
    liveAnnouncements.filter((a) => topicIds.has(a.id)).map((a) => [a.id, a.postedAt] as const)
  );

  const existing: ExistingAnnouncementRow[] = storedRows.map((r) => ({
    weekNumber: r.weekNumber,
    status: r.status,
    topicId: r.topicId,
    postedAt: r.topicId !== null ? postedById.get(r.topicId) ?? null : null,
    scheduledFor: r.scheduledFor,
    title: r.title,
  }));

  const plan = planAnnouncements(slots, existing, now);
  return { storedRows, liveAnnouncements, plan };
}
