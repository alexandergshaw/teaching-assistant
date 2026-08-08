"use server";

import { deriveAltTextFromHtml, deriveLinkTextFromHtml } from "@/lib/embedded/accessibility";
import { getCourseName, listAnnouncements, createAnnouncement, createScheduledAnnouncementResilient, updateAnnouncementSchedule, getAnnouncementById, listConversations, getConversation, replyToConversation, listCourses, listCoursesByTerm, setConversationWorkflowState, listCourseRoster, listAssignmentTextSubmissions, listCourseAssignmentDueDates, listAssignmentBriefsWithDue, listStudentGradeSummaries, type CanvasAnnouncement, type CanvasConversationSummary, type CanvasConversationDetail, type CanvasCourse, type CanvasRosterEntry, type CanvasTextSubmission } from "@/lib/canvas";
import { resolveInstitution, resolveInstitutionByCode } from "@/lib/canvas-core";
import { callLlm, type LlmProvider } from "@/lib/llm";
import { requireOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import {
  listScheduledAnnouncementRows,
  insertPendingScheduledAnnouncement,
  confirmScheduledAnnouncement,
  rescheduleScheduledAnnouncement,
} from "@/lib/supabase/weekly-announcement-schedule";
import {
  buildAnnouncementSchedule,
  planAnnouncements,
  findMatchingAnnouncement,
  renderAnnouncementTemplate,
  formatWeekOutcomeReport,
  parsePostTime,
  type ExistingAnnouncementRow,
  type AnnouncementWeekReportLine,
} from "@/lib/announcement-schedule";

// ── Canvas announcements + inbox (the Canvas tab) ───────────────────────────
//
// Every action below is owner-gated (owner allowlist + AAL2) because it uses the
// privileged Canvas API token, or — for the AI drafts — bills LLM usage. Each
// returns plain serializable data or an { error } string the UI surfaces inline.

/** Load a course's name + recent announcements for the announcements panel. */
/** List the active teacher courses for an institution (announcements picker). */
export async function listCoursesAction(
  acronym: string
): Promise<{ courses: CanvasCourse[] } | { error: string }> {
  try {
    await requireOwner();
    return { courses: await listCourses(acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load courses." };
  }
}

export async function listCourseRosterAction(
  code: string,
  courseId: string
): Promise<{ students: CanvasRosterEntry[] } | { error: string }> {
  try {
    await requireOwner();
    return { students: await listCourseRoster(code.trim().toUpperCase(), courseId) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the roster." };
  }
}

export async function listCourseGradeSummariesAction(
  code: string,
  courseId: string
): Promise<
  | {
      students: Array<{ userId: string; name: string; currentScore: number | null; finalScore: number | null }>;
    }
  | { error: string }
> {
  try {
    await requireOwner();
    const summaries = await listStudentGradeSummaries(code.trim().toUpperCase(), courseId);
    return { students: summaries };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load grade summaries." };
  }
}

export async function listAssignmentTextSubmissionsAction(
  code: string,
  courseId: string,
  assignmentId: string
): Promise<{ submissions: CanvasTextSubmission[] } | { error: string }> {
  try {
    await requireOwner();
    return {
      submissions: await listAssignmentTextSubmissions(
        code.trim().toUpperCase(),
        courseId,
        assignmentId
      ),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read submissions." };
  }
}

export async function listCourseAssignmentDueDatesAction(
  code: string,
  courseId: string
): Promise<{ assignments: Array<{ assignmentId: string; name: string; dueAt: string | null }> } | { error: string }> {
  try {
    await requireOwner();
    return { assignments: await listCourseAssignmentDueDates(code.trim().toUpperCase(), courseId) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load assignment due dates." };
  }
}

export async function listAssignmentDueDatesByUrlAction(
  courseUrl: string,
  fallbackAcronym?: string
): Promise<{ assignments: Array<{ assignmentId: string; name: string; dueAt: string | null }>; institution: string } | { error: string }> {
  try {
    await requireOwner();

    // Check if the URL is absolute (parseable as a full URL)
    let isAbsolute = false;
    try {
      new URL(courseUrl);
      isAbsolute = true;
    } catch {
      // relative URL
    }

    // Resolve institution from URL, with fallback to acronym for relative URLs only
    let resolved;
    try {
      resolved = resolveInstitution(courseUrl);
    } catch (e) {
      // Absolute URLs must resolve from their host; don't fall back to acronym
      if (isAbsolute) {
        return { error: e instanceof Error ? e.message : "Could not match the course URL to a configured institution." };
      }
      // Relative URLs can fall back to the provided acronym
      try {
        resolved = resolveInstitutionByCode((fallbackAcronym ?? "").trim().toUpperCase());
      } catch {
        return { error: "Could not match the course URL to a configured institution." };
      }
    }

    // Parse course ID from URL
    const courseMatch = courseUrl.match(/courses\/(\d+)/);
    if (!courseMatch || !courseMatch[1]) {
      return { error: "Could not parse the Canvas course ID from the URL." };
    }
    const courseId = courseMatch[1];

    // Fetch assignments and filter to published ones
    const briefs = await listAssignmentBriefsWithDue(resolved.baseUrl, resolved.token, resolved.institution, courseId);
    const assignments = briefs
      .filter((b) => b.published !== false)
      .map((b) => ({ assignmentId: b.assignmentId, name: b.name, dueAt: b.dueAt }));

    return { assignments, institution: resolved.institution.code };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load assignment due dates." };
  }
}

export async function listAssignmentBriefsByUrlAction(
  courseUrl: string,
  fallbackAcronym?: string
): Promise<{ assignments: Array<{ name: string; pointsPossible: number | null; dueAt: string | null }>; institution: string } | { error: string }> {
  try {
    await requireOwner();

    let isAbsolute = false;
    try {
      new URL(courseUrl);
      isAbsolute = true;
    } catch {
    }

    let resolved;
    try {
      resolved = resolveInstitution(courseUrl);
    } catch (e) {
      if (isAbsolute) {
        return { error: e instanceof Error ? e.message : "Could not match the course URL to a configured institution." };
      }
      try {
        resolved = resolveInstitutionByCode((fallbackAcronym ?? "").trim().toUpperCase());
      } catch {
        return { error: "Could not match the course URL to a configured institution." };
      }
    }

    const courseMatch = courseUrl.match(/courses\/(\d+)/);
    if (!courseMatch || !courseMatch[1]) {
      return { error: "Could not parse the Canvas course ID from the URL." };
    }
    const courseId = courseMatch[1];

    const briefs = await listAssignmentBriefsWithDue(resolved.baseUrl, resolved.token, resolved.institution, courseId);
    const assignments = briefs
      .filter((b) => b.published !== false)
      .map((b) => ({ name: b.name, pointsPossible: b.pointsPossible, dueAt: b.dueAt }));

    return { assignments, institution: resolved.institution.code };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load assignment briefs." };
  }
}

export async function listAnnouncementsAction(
  courseUrl: string,
  acronym?: string
): Promise<{ courseName: string; announcements: CanvasAnnouncement[] } | { error: string }> {
  try {
    await requireOwner();
    const [courseName, announcements] = await Promise.all([
      getCourseName(courseUrl, acronym),
      listAnnouncements(courseUrl, acronym),
    ]);
    return { courseName, announcements };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load announcements." };
  }
}

/** Post a new announcement to the course. */
export async function createAnnouncementAction(
  courseUrl: string,
  title: string,
  message: string,
  acronym?: string,
  // ISO 8601 time to schedule visibility; omit/empty to post immediately.
  delayedPostAt?: string
): Promise<{ announcement: CanvasAnnouncement } | { error: string }> {
  try {
    await requireOwner();
    const announcement = await createAnnouncement(courseUrl, title, message, acronym, delayedPostAt);
    return { announcement };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not post the announcement." };
  }
}

/** List courses by institution and term. */
export async function listCoursesByTermAction(
  institution: string,
  term: string
): Promise<
  | {
      courses: Array<{
        id: string;
        name: string;
        courseCode: string | null;
        termName: string | null;
        startAt: string | null;
      }>;
    }
  | { error: string }
> {
  try {
    await requireOwner();
    if (!institution.trim()) {
      return { error: "Enter an institution." };
    }
    const courses = await listCoursesByTerm(institution.trim().toUpperCase(), term);
    return { courses };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list the term's courses." };
  }
}

/** Create a scheduled announcement in a course. */
export async function createScheduledAnnouncementAction(
  courseUrl: string,
  title: string,
  message: string,
  delayedPostAt: string | null,
  acronym?: string
): Promise<{ id: number } | { error: string }> {
  try {
    await requireOwner();
    if (!title.trim()) return { error: "An announcement needs a title." };
    if (!message.trim()) return { error: "An announcement needs a message." };
    const announcement = await createAnnouncement(courseUrl, title, message, acronym, delayedPostAt);
    return { id: announcement.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the announcement." };
  }
}

/** List the account Inbox conversations for the selected institution (or default). */
export async function listConversationsAction(
  acronym?: string
): Promise<{ conversations: CanvasConversationSummary[] } | { error: string }> {
  try {
    await requireOwner();
    return { conversations: await listConversations(acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the inbox." };
  }
}

/** Fetch one conversation's full thread. */
export async function getConversationAction(
  id: number,
  acronym?: string
): Promise<{ conversation: CanvasConversationDetail } | { error: string }> {
  try {
    await requireOwner();
    return { conversation: await getConversation(id, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the conversation." };
  }
}

/** Reply to a conversation, then return its refreshed thread. */
export async function replyToConversationAction(
  id: number,
  body: string,
  acronym?: string
): Promise<{ conversation: CanvasConversationDetail } | { error: string }> {
  try {
    await requireOwner();
    await replyToConversation(id, body, acronym);
    return { conversation: await getConversation(id, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not send the reply." };
  }
}

/** Mark a conversation read/unread or archive it. */
export async function setConversationStateAction(
  id: number,
  state: "read" | "unread" | "archived",
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await setConversationWorkflowState(id, state, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the conversation." };
  }
}

/** Suggest concise alt text for an image, from its HTML + the item it lives on. */
export async function suggestAltTextAction(
  itemTitle: string,
  snippet: string,
  provider: LlmProvider = "gemini"
): Promise<{ text: string } | { error: string }> {
  try {
    await requireOwner();
    // Embedded Deterministic Engine: derive alt text from the image's file name.
    if (provider === "embedded") {
      const alt = deriveAltTextFromHtml(snippet);
      return alt
        ? { text: alt }
        : { error: "The embedded engine couldn't infer alt text from the image's file name. Switch to an LLM provider for a description." };
    }

    const prompt = `An image on a course item titled "${itemTitle}" needs better alt text for screen-reader users. Here is the image's HTML (use its file name and any context to infer the subject):

${snippet}

Write concise, descriptive alt text under 125 characters that conveys the image's content or purpose. Do not start with "image of" or "picture of". Return ONLY the alt text, with no quotes or commentary.`;
    const result = await callLlm(
      { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 120 } },
      provider
    );
    if (!result.ok) return { error: `Suggestion failed: HTTP ${result.status}` };
    const text = result.text.trim().replace(/^["']|["']$/g, "").slice(0, 200);
    return text ? { text } : { error: "The model returned empty text." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/** Suggest descriptive link text from the link's HTML + the item it lives on. */
export async function suggestLinkTextAction(
  itemTitle: string,
  snippet: string,
  provider: LlmProvider = "gemini"
): Promise<{ text: string } | { error: string }> {
  try {
    await requireOwner();
    // Embedded Deterministic Engine: derive readable link text from the URL.
    if (provider === "embedded") {
      const linkText = deriveLinkTextFromHtml(snippet);
      return linkText
        ? { text: linkText }
        : { error: "The embedded engine couldn't derive link text from the URL. Switch to an LLM provider." };
    }

    const prompt = `A hyperlink on a course item titled "${itemTitle}" has unclear link text (e.g. "click here"). Here is the link's HTML:

${snippet}

Write concise, descriptive link text (a few words) that tells the reader where the link goes, based on its URL. Return ONLY the link text, with no quotes or commentary.`;
    const result = await callLlm(
      { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 60 } },
      provider
    );
    if (!result.ok) return { error: `Suggestion failed: HTTP ${result.status}` };
    const text = result.text.trim().replace(/^["']|["']$/g, "").slice(0, 120);
    return text ? { text } : { error: "The model returned empty text." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

// ── Weekly announcement scheduling ──────────────────────────────────────────
// (docs/weekly-announcement-scheduling-acceptance-criteria.md)
//
// ONE action owns every Canvas call and every mapping-table read/write for
// this feature - the "schedule-weekly-announcements-for-term" registry step
// (src/lib/workflows/registry/steps.weekly-announcement-schedule.ts) only
// resolves the course tile and renders the report this returns. That keeps
// the (client-bundled) registry step file free of any @/lib/supabase/server,
// @/app/actions/shared, or next/headers import - AC8 item 30.

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
  stoppedEarly: boolean;
  /** Every week's status + detail (AC9 item 31), plus the standing
   * break-weeks-not-excluded disclosure (AC9 item 32) - see
   * formatWeekOutcomeReport, src/lib/announcement-schedule.ts. */
  report: string;
  /** Same content as `report`, split into lines - convenient for a step's
   * "list" summary kind. */
  lines: string[];
}

// Stays comfortably under this app's 60-second Vercel Hobby maxDuration (see
// docs memory "Deployment: Vercel Hobby") - checked before EACH week
// (AC5 item 21), so the run stops cleanly BETWEEN weeks, never mid-week. The
// mapping table is the checkpoint (AC5 item 20): the next run resumes from
// whatever is left un-confirmed, with no separate continuation token.
const RUN_TIME_BUDGET_MS = 45_000;

/**
 * Pre-schedule one announcement per in-session week (AC1/AC2), safely
 * re-runnable against a course that is already partially or fully scheduled
 * (AC3), tolerant of a truncated prior run (AC5), and able to reschedule
 * after a start-date edit without duplicating anything (AC6).
 *
 * `hubCourseId` is this app's own course_hub row id - the mapping table's
 * natural key is (hubCourseId, week), NOT the Canvas course id, matching how
 * every other per-course mapping table in this app (course_tasks, and
 * course_hub itself) is keyed.
 *
 * `postTimeRaw` is an OPTIONAL "HH:MM" 24-hour time-of-day - blank or
 * unparseable both fall back to the same 8:00 AM default this feature
 * shipped with (parsePostTime, src/lib/announcement-schedule.ts), so leaving
 * it blank reproduces the original behavior exactly.
 *
 * `testOverrides` is never passed by the registry step (it always uses the
 * real wall clock and the real time budget) - it exists so a test can pin
 * "now" for the past/future decision and drive the elapsed-time budget
 * check deterministically, the same way `now` is already injected
 * throughout src/lib/announcement-schedule.ts, rather than sleeping for real
 * seconds or racing the real clock (AC5 items 20/21, AC2 item 6 - see this
 * repo's own "Tests still owed" note in the AC document for why this was
 * left injectable).
 */
export async function scheduleWeeklyAnnouncementsAction(
  hubCourseId: string,
  courseUrl: string,
  acronym: string | undefined,
  startDateRaw: string,
  weekCount: number,
  weekday: number,
  postTimeRaw: string,
  titleTemplate: string,
  messageTemplate: string,
  testOverrides?: { planningNow?: Date; clock?: () => number; budgetMs?: number }
): Promise<{ result: AnnouncementScheduleRunResult } | { error: string }> {
  try {
    const user = await requireOwner();

    if (!hubCourseId.trim()) return { error: "Choose a course tile." };
    if (!courseUrl.trim()) return { error: "The course tile has no LMS course linked." };
    const startDate = startDateRaw ? new Date(`${startDateRaw.trim()}T00:00:00`) : null;
    if (!startDate || Number.isNaN(startDate.getTime())) {
      return { error: "The course tile has no valid start date set." };
    }
    if (!Number.isFinite(weekCount) || weekCount <= 0) {
      return { error: "The course tile has no valid number of weeks set." };
    }
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return { error: "Choose a weekday to post on." };
    }
    if (!titleTemplate.trim() || !messageTemplate.trim()) {
      return { error: "Provide a title and message for the announcement." };
    }

    const supabase = createServiceClient();
    const postTime = parsePostTime(postTimeRaw);
    const slots = buildAnnouncementSchedule(startDate, Math.floor(weekCount), weekday, postTime);
    const now = testOverrides?.planningNow ?? new Date();
    const clock = testOverrides?.clock ?? Date.now;
    const budgetMs = testOverrides?.budgetMs ?? RUN_TIME_BUDGET_MS;
    // DEFECT 3 fix: the clock starts here, BEFORE the mapping-table read and
    // the Canvas read-back below - both count against the budget now, not
    // just the per-week loop. Capturing it any later left the read-back's
    // real cost (which can be non-trivial: AC4's allPages pagination on a
    // long-lived course) entirely outside the 45s budget, silently eating
    // into the margin against this app's real 60s Vercel Hobby cap.
    const startedAtMs = clock();

    const storedRows = await listScheduledAnnouncementRows(supabase, user.id, hubCourseId);

    // AC3 item 12b: read Canvas-sourced postedAt for every row that already
    // carries a topic id, BEFORE planning - the mapping table itself never
    // learns whether Canvas has posted (the write-ahead insert always
    // commits first). Paginated (AC4): a long term can carry more than one
    // page of announcements. Skipped entirely when there is nothing to
    // check against (a first-ever run has no stored rows at all).
    const topicIds = new Set(
      storedRows.filter((r): r is typeof r & { topicId: number } => r.topicId !== null).map((r) => r.topicId)
    );
    const needsReadBack = topicIds.size > 0 || storedRows.some((r) => r.status === "pending");

    // DEFECT 2 fix: this read-back used to sit outside every error handler -
    // any transient Canvas failure here (this is the SAME read-back a later
    // re-run repeats every time rows already exist, so it is also the
    // failure a professor is statistically most likely to actually hit)
    // aborted the WHOLE action into a single `{ error }` string, with no
    // per-week report at all. It is now caught here and degrades to a
    // normal per-week report instead: every desired week is reported
    // "failed" with the real underlying error (never an aggregate message -
    // AC9 item 31), the action still returns a normal `{ result }`, and
    // NOTHING is written to the mapping table this run - safe to just
    // re-run once Canvas recovers.
    let liveAnnouncements: CanvasAnnouncement[] = [];
    if (needsReadBack) {
      try {
        liveAnnouncements = await listAnnouncements(courseUrl, acronym, { allPages: true });
      } catch (err) {
        const detail = err instanceof Error ? err.message : "Could not read back existing announcements from Canvas.";
        const weekResults: AnnouncementScheduleWeekResult[] = slots.map((s) => ({
          week: s.week,
          outcome: "failed",
          detail: `Could not check Canvas's existing announcements before planning this week: ${detail}`,
        }));
        const report = formatWeekOutcomeReport(
          weekResults.map((r) => ({ week: r.week, status: r.outcome, detail: r.detail }))
        );
        return {
          result: {
            weeks: weekResults,
            createdCount: 0,
            resolvedCreatedCount: 0,
            rescheduledCount: 0,
            alreadyPresentCount: 0,
            skippedPastCount: 0,
            failedCount: weekResults.length,
            stoppedEarly: false,
            report,
            lines: report.split("\n"),
          },
        };
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
    }));

    const plan = planAnnouncements(slots, existing, now);
    const weekResults: AnnouncementScheduleWeekResult[] = [];
    let stoppedEarly = false;

    // AC7 item 25: sequential, never parallel - one week's Canvas call
    // completes (or fails) before the next one is issued.
    for (const entry of plan) {
      if (clock() - startedAtMs > budgetMs) {
        stoppedEarly = true;
        weekResults.push({
          week: entry.week,
          outcome: "not-attempted",
          detail: "Not attempted this run - stopped for the execution time budget. Re-run to resume from here; nothing already confirmed is repeated.",
        });
        continue;
      }

      const title = renderAnnouncementTemplate(titleTemplate, entry.week);
      const message = renderAnnouncementTemplate(messageTemplate, entry.week);
      const postAtIso = entry.postAt.toISOString();

      try {
        switch (entry.action) {
          case "skip-past":
            weekResults.push({ week: entry.week, outcome: "skipped-past", detail: entry.reason });
            break;

          case "already-present":
            weekResults.push({ week: entry.week, outcome: "already-present", detail: entry.reason });
            break;

          case "leave-posted":
            weekResults.push({ week: entry.week, outcome: "left-posted", detail: entry.reason });
            break;

          case "create": {
            await insertPendingScheduledAnnouncement(supabase, user.id, hubCourseId, entry.week, postAtIso);
            const created = await createScheduledAnnouncementResilient(courseUrl, title, message, postAtIso, acronym);
            await confirmScheduledAnnouncement(supabase, user.id, hubCourseId, entry.week, created.id, postAtIso);
            weekResults.push({
              week: entry.week,
              outcome: "created",
              detail: `Scheduled for ${entry.postAt.toLocaleString()}.`,
            });
            break;
          }

          case "reschedule": {
            const topicId = entry.existing?.topicId ?? null;
            if (topicId === null) {
              throw new Error("No Canvas topic id on file to reschedule.");
            }
            await updateAnnouncementSchedule(courseUrl, topicId, postAtIso, acronym);
            await rescheduleScheduledAnnouncement(supabase, user.id, hubCourseId, entry.week, postAtIso);
            weekResults.push({
              week: entry.week,
              outcome: "rescheduled",
              detail: `Rescheduled to ${entry.postAt.toLocaleString()}.`,
            });
            break;
          }

          case "resolve-pending": {
            // AC3 item 11: targeted read-back, never a blind re-create.
            // First, a single targeted GET when a topic id is already on
            // file (the crash landed after Canvas responded but before the
            // confirm write committed); otherwise, a best-effort content
            // match against the paginated list already fetched above (the
            // crash landed before Canvas ever returned an id at all).
            const topicId = entry.existing?.topicId ?? null;
            let resolved: CanvasAnnouncement | null = null;
            if (topicId !== null) {
              resolved = await getAnnouncementById(courseUrl, topicId, acronym);
            }
            if (!resolved) {
              resolved = findMatchingAnnouncement(liveAnnouncements, title, entry.postAt);
            }

            if (resolved) {
              await confirmScheduledAnnouncement(supabase, user.id, hubCourseId, entry.week, resolved.id, postAtIso);
              weekResults.push({
                week: entry.week,
                outcome: "resolved-existing",
                detail: "Found this week's announcement already on Canvas from a previous run - linked, not duplicated.",
              });
            } else {
              const created = await createScheduledAnnouncementResilient(courseUrl, title, message, postAtIso, acronym);
              await confirmScheduledAnnouncement(supabase, user.id, hubCourseId, entry.week, created.id, postAtIso);
              weekResults.push({
                week: entry.week,
                outcome: "resolved-created",
                detail: `A previous run's attempt never reached Canvas - created now, for ${entry.postAt.toLocaleString()}.`,
              });
            }
            break;
          }
        }
      } catch (err) {
        weekResults.push({
          week: entry.week,
          outcome: "failed",
          detail: err instanceof Error ? err.message : "An unexpected error occurred.",
        });
      }
    }

    const count = (outcome: AnnouncementScheduleOutcome) =>
      weekResults.filter((r) => r.outcome === outcome).length;

    const reportLines: AnnouncementWeekReportLine[] = weekResults.map((r) => ({
      week: r.week,
      status: r.outcome,
      detail: r.detail,
    }));
    const report = formatWeekOutcomeReport(reportLines);

    const result: AnnouncementScheduleRunResult = {
      weeks: weekResults,
      createdCount: count("created"),
      resolvedCreatedCount: count("resolved-created"),
      rescheduledCount: count("rescheduled"),
      alreadyPresentCount: count("already-present") + count("resolved-existing"),
      skippedPastCount: count("skipped-past"),
      failedCount: count("failed"),
      stoppedEarly,
      report,
      lines: report.split("\n"),
    };
    return { result };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not schedule weekly announcements." };
  }
}
