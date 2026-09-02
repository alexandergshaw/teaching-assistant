"use server";

import { deriveAltTextFromHtml, deriveLinkTextFromHtml } from "@/lib/embedded/accessibility";
import { getCourseName, listAnnouncements, createAnnouncement, createScheduledAnnouncementResilient, updateAnnouncementSchedule, getAnnouncementById, resolveAnnouncementImage, listConversations, getConversation, replyToConversation, listCourses, listCoursesByTerm, setConversationWorkflowState, listCourseRoster, listAssignmentTextSubmissions, listCourseAssignmentDueDates, listAssignmentBriefsWithDue, listStudentGradeSummaries, type CanvasAnnouncement, type CanvasConversationSummary, type CanvasConversationDetail, type CanvasCourse, type CanvasRosterEntry, type CanvasTextSubmission } from "@/lib/canvas";
import { resolveInstitution, resolveInstitutionByCode } from "@/lib/canvas-core";
import { callLlm, type LlmProvider } from "@/lib/llm";
import { requireOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import {
  insertPendingScheduledAnnouncement,
  confirmScheduledAnnouncement,
  rescheduleScheduledAnnouncement,
} from "@/lib/supabase/weekly-announcement-schedule";
import {
  buildAnnouncementSchedule,
  findMatchingAnnouncement,
  renderAnnouncementTemplate,
  formatWeekOutcomeReport,
  parsePostTime,
  type AnnouncementPlanAction,
  type AnnouncementPlanEntry,
  type AnnouncementWeekReportLine,
} from "@/lib/announcement-schedule";
import {
  resolveAnnouncementTitle,
  type WeeklyAnnouncementDraft,
} from "@/lib/announcement-module-content";
import {
  loadWeeklyAnnouncementPlan,
  CanvasReadBackError,
  RUN_TIME_BUDGET_MS,
  DRAFTED_RUN_WRITE_BUDGET_MS,
  type AnnouncementScheduleOutcome,
  type AnnouncementScheduleWeekResult,
  type AnnouncementScheduleRunResult,
} from "@/lib/weekly-announcement-run";

// A "use server" file may export only async functions, so this type is
// imported for local use only and deliberately NOT re-exported - its home is
// @/lib/announcement-module-content, and that is where consumers import it
// from.

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

/**
 * Post a new announcement to the course. `image` is optional and additive -
 * every existing caller omits it, so behavior is unchanged. When supplied,
 * resolveAnnouncementImage (@/lib/canvas) uploads it and resolves it to a
 * course-scoped src; an upload failure never fails the post, surfacing as
 * `imageError` on an otherwise-successful, text-only result instead.
 */
export async function createAnnouncementAction(
  courseUrl: string,
  title: string,
  message: string,
  acronym?: string,
  // ISO 8601 time to schedule visibility; omit/empty to post immediately.
  delayedPostAt?: string,
  image?: { base64: string; mimeType: string; altText: string; fileName?: string }
): Promise<{ announcement: CanvasAnnouncement; imageError?: string } | { error: string }> {
  try {
    await requireOwner();

    if (!image) {
      const announcement = await createAnnouncement(courseUrl, title, message, acronym, delayedPostAt);
      return { announcement };
    }

    const { image: uploadedImage, imageError } = await resolveAnnouncementImage(courseUrl, image, acronym);
    const announcement = await createAnnouncement(courseUrl, title, message, acronym, delayedPostAt, uploadedImage);
    return imageError ? { announcement, imageError } : { announcement };
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
//
// The result types (AnnouncementScheduleOutcome/WeekResult/RunResult), this
// action's own write-time budgets, the CanvasReadBackError tag, and the
// shared load-rows+read-back+plan sequence (loadWeeklyAnnouncementPlan) all
// live in src/lib/weekly-announcement-run.ts, imported above - moved there to
// keep this file under the repo-wide 1000-line ceiling. See that file's own
// header for why (a "use server" file may not re-export a type through
// itself) and why it is not part of announcement-schedule.ts instead (that
// file is deliberately fetch-free; loadWeeklyAnnouncementPlan is not).

/**
 * Runs the SAME load-rows + Canvas read-back + planAnnouncements sequence
 * scheduleWeeklyAnnouncementsAction does, and WRITES NOTHING - lets a caller
 * (the registry step) see which weeks actually need a drafted announcement
 * before spending an LLM call on any of them (module-content acceptance
 * criteria AC1 item 6). A Canvas read-back failure here has no per-week
 * status vocabulary to degrade into (AnnouncementPlanAction has no "failed"
 * member - only the executor's outcome type does), so it surfaces as a
 * plain `{ error }` instead.
 */
export async function planWeeklyAnnouncementsAction(
  hubCourseId: string,
  courseUrl: string,
  acronym: string | undefined,
  startDateRaw: string,
  weekCount: number,
  weekday: number,
  postTimeRaw: string,
  testOverrides?: { planningNow?: Date }
): Promise<{ weeks: Array<{ week: number; action: AnnouncementPlanAction }> } | { error: string }> {
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

    const supabase = createServiceClient();
    const postTime = parsePostTime(postTimeRaw);
    const slots = buildAnnouncementSchedule(startDate, Math.floor(weekCount), weekday, postTime);
    const now = testOverrides?.planningNow ?? new Date();

    const { plan } = await loadWeeklyAnnouncementPlan(supabase, user.id, hubCourseId, courseUrl, acronym, slots, now);
    return { weeks: plan.map((p) => ({ week: p.week, action: p.action })) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not plan weekly announcements." };
  }
}

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
 * `testOverrides` exists so a test can pin "now" for the past/future
 * decision and drive the elapsed-time budget check deterministically, the
 * same way `now` is already injected throughout
 * src/lib/announcement-schedule.ts, rather than sleeping for real seconds or
 * racing the real clock (AC5 items 20/21, AC2 item 6) - a live run always
 * uses the real wall clock and the real time budget.
 *
 * `runOptions.drafts` is the module-content acceptance criteria's opt-in
 * (AC3 item 15): when undefined, every existing guarantee holds byte for
 * byte, INCLUDING the blanket "title and message both required" rejection
 * below. When supplied, each week resolves its own title/message from the
 * matching drafts entry (falling back to the rendered templates, and to a
 * per-week "failed" outcome when neither is available) instead of that
 * blanket check - see the per-week resolution inside the loop below.
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
  testOverrides?: { planningNow?: Date; clock?: () => number; budgetMs?: number },
  runOptions?: { drafts?: WeeklyAnnouncementDraft[] }
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
    const draftsEnabled = runOptions?.drafts !== undefined;
    // AC3 item 15: this blanket rejection is TEMPLATE MODE's rule only. With
    // drafts supplied, each week resolves its own title/message below - a
    // week with neither a draft nor a template is reported "failed"
    // individually instead of aborting the whole run.
    if (!draftsEnabled && (!titleTemplate.trim() || !messageTemplate.trim())) {
      return { error: "Provide a title and message for the announcement." };
    }
    const draftsByWeek = new Map((runOptions?.drafts ?? []).map((d) => [d.week, d] as const));

    const supabase = createServiceClient();
    const postTime = parsePostTime(postTimeRaw);
    const slots = buildAnnouncementSchedule(startDate, Math.floor(weekCount), weekday, postTime);
    const now = testOverrides?.planningNow ?? new Date();
    const clock = testOverrides?.clock ?? Date.now;
    // DEFECT 3 fix: draftsEnabled is also the signal that drafting already
    // spent part of this run's window (see DRAFTED_RUN_WRITE_BUDGET_MS
    // above) - use the smaller write budget whenever drafts were supplied,
    // regardless of whether any of them actually needed drafting text.
    const budgetMs = testOverrides?.budgetMs ?? (draftsEnabled ? DRAFTED_RUN_WRITE_BUDGET_MS : RUN_TIME_BUDGET_MS);
    // The clock starts here, BEFORE the mapping-table read and the Canvas
    // read-back below - both count against the budget now, not just the
    // per-week loop. Capturing it any later left the read-back's real cost
    // (which can be non-trivial: AC4's allPages pagination on a long-lived
    // course) entirely outside the budget, silently eating into the margin
    // against this app's real 60s Vercel Hobby cap.
    const startedAtMs = clock();

    // DEFECT 2 fix: a transient CANVAS failure here (this is the SAME
    // read-back a later re-run repeats every time rows already exist, so
    // it is also the failure a professor is statistically most likely to
    // actually hit) degrades to a normal per-week report instead of
    // aborting the whole action: every desired week is reported "failed"
    // with the real underlying error (never an aggregate message - AC9 item
    // 31), the action still returns a normal `{ result }`, and NOTHING is
    // written to the mapping table this run - safe to just re-run once
    // Canvas recovers. A SUPABASE failure in the same helper is a different
    // fault entirely and must not be relabeled as Canvas's - only
    // CanvasReadBackError is caught here; anything else re-throws to the
    // outer catch below, which returns it as a plain `{ error }` the way it
    // always has (entry 236 check 24 grants the degrade-to-per-week-report
    // behavior to the Canvas read-back specifically, not to any failure in
    // the vicinity).
    let plan: AnnouncementPlanEntry[];
    let liveAnnouncements: CanvasAnnouncement[];
    try {
      const loaded = await loadWeeklyAnnouncementPlan(supabase, user.id, hubCourseId, courseUrl, acronym, slots, now);
      plan = loaded.plan;
      liveAnnouncements = loaded.liveAnnouncements;
    } catch (err) {
      if (!(err instanceof CanvasReadBackError)) {
        throw err;
      }
      const detail = err.message;
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

    const weekResults: AnnouncementScheduleWeekResult[] = [];
    let stoppedEarly = false;

    // AC7 item 25: sequential, never parallel - one week's Canvas call
    // completes (or fails) before the next one is issued. This holds
    // regardless of drafts - drafting already happened, if at all, in the
    // caller's own earlier call to draftModuleAnnouncementsAction.
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

      const draft = draftsEnabled ? draftsByWeek.get(entry.week) : undefined;

      // Module-content AC2 item 11a: a deferred week is left ENTIRELY for
      // the next run - no Canvas call, no mapping-table write, and
      // (critically) no fallback to the template, which would permanently
      // cost the instructor the drafted announcement a mere re-run would
      // still get them. Only weeks this run would otherwise write to Canvas
      // are ever drafted for (AC5 item 22), so this only matters for
      // create/resolve-pending entries.
      if (draftsEnabled && draft?.defer && (entry.action === "create" || entry.action === "resolve-pending")) {
        // A deferred draft leaves work undone for this term just like the
        // execution budget below does - both mean the same thing to the
        // instructor reading the run summary: it is not finished, re-run to
        // pick up where this left off. stoppedEarly drives that summary line
        // (steps.weekly-announcement-schedule.ts), so it is set here too, not
        // only on the execution-budget branch.
        stoppedEarly = true;
        weekResults.push({
          week: entry.week,
          outcome: "not-attempted",
          detail: "Not drafted this run - stopped for the drafting time budget. Re-run to draft and schedule this week.",
        });
        continue;
      }

      const renderedTitle = renderAnnouncementTemplate(titleTemplate, entry.week);
      const renderedMessage = renderAnnouncementTemplate(messageTemplate, entry.week);
      // AC4 item 16: the instructor's own title template still wins
      // whenever it is non-blank, then the drafted title, then "Week N".
      const title = draftsEnabled
        ? resolveAnnouncementTitle(renderedTitle, draft?.title ?? "", entry.week)
        : renderedTitle;
      // AC3 item 13a: a BLANK drafted message is a fallback REQUEST, not
      // content - Canvas would happily post it, so this is the only place
      // that can catch it.
      const message = draftsEnabled ? (draft?.message ?? "").trim() || renderedMessage.trim() : renderedMessage;
      const postAtIso = entry.postAt.toISOString();
      // AC7 item 30: the draft's provenance note is reported ONLY on a week
      // this run actually writes to Canvas ("created"/"resolved-created") -
      // never on a week the fresh re-plan resolves to already-present,
      // skip-past, leave-posted, or reschedule, since nothing was written
      // there. Appended below only inside those two branches.
      const noteSuffix = draft?.note ? ` ${draft.note}.` : "";

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
            // AC3 item 13: no drafted message and a blank template leaves
            // nothing to post - fail this week alone, the rest continue.
            if (!message.trim()) {
              weekResults.push({
                week: entry.week,
                outcome: "failed",
                detail: `No drafted message and the message template is blank for week ${entry.week} - nothing to post.`,
              });
              break;
            }
            await insertPendingScheduledAnnouncement(supabase, user.id, hubCourseId, entry.week, postAtIso, title);
            const created = await createScheduledAnnouncementResilient(courseUrl, title, message, postAtIso, acronym);
            await confirmScheduledAnnouncement(supabase, user.id, hubCourseId, entry.week, created.id, postAtIso, title);
            weekResults.push({
              week: entry.week,
              outcome: "created",
              detail: `Scheduled for ${entry.postAt.toLocaleString()}.${noteSuffix}`,
            });
            break;
          }

          case "reschedule": {
            // AC5 item 22: never re-drafts, never rewrites title/body -
            // moves delayed_post_at only, so no title argument here.
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
            // A pending row is a crash-recovery state, not a publishing
            // request - the targeted read-back below runs regardless of
            // whether there is anything to post, since linking an
            // announcement Canvas already has needs no message at all. Only
            // the create-fallback path below (nothing found on Canvas) is
            // actually a publish, so the blank-message guard lives there
            // instead of here - a blank message must never fail this branch
            // before it even checks Canvas, or a week that is already
            // resolvable is failed and left pending forever (entry 236 check
            // 23's stranded-pending-row shape).
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
              // AC4 item 19: match against the STORED title when the row has
              // one, else the rendered template title - NEVER this run's
              // freshly drafted title, or a crashed run's own announcement
              // would go unrecognized and get duplicated.
              const matchTitle = entry.existing?.title ?? renderedTitle;
              resolved = findMatchingAnnouncement(liveAnnouncements, matchTitle, entry.postAt);
            }

            if (resolved) {
              // AC4 item 18: write back the title Canvas actually carries,
              // never this run's freshly drafted one - a row that disagrees
              // with Canvas poisons the NEXT recovery.
              await confirmScheduledAnnouncement(
                supabase,
                user.id,
                hubCourseId,
                entry.week,
                resolved.id,
                postAtIso,
                resolved.title
              );
              weekResults.push({
                week: entry.week,
                outcome: "resolved-existing",
                detail: "Found this week's announcement already on Canvas from a previous run - linked, not duplicated.",
              });
            } else if (!message.trim()) {
              // Nothing on Canvas to link, and nothing to post either - this
              // is the one path in this branch that would actually publish,
              // so this is where the blank-message guard belongs.
              weekResults.push({
                week: entry.week,
                outcome: "failed",
                detail: `No drafted message and the message template is blank for week ${entry.week} - nothing to post.`,
              });
            } else {
              const created = await createScheduledAnnouncementResilient(courseUrl, title, message, postAtIso, acronym);
              await confirmScheduledAnnouncement(supabase, user.id, hubCourseId, entry.week, created.id, postAtIso, title);
              weekResults.push({
                week: entry.week,
                outcome: "resolved-created",
                detail: `A previous run's attempt never reached Canvas - created now, for ${entry.postAt.toLocaleString()}.${noteSuffix}`,
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
