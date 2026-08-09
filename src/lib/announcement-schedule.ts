// Pure scheduling + idempotency-planning logic for the weekly announcement
// scheduling feature
// (docs/weekly-announcement-scheduling-acceptance-criteria.md). Two layers,
// both pure and fetch-free so they stay unit-testable without a live Canvas
// connection or a live Supabase session, and so this module stays safe to
// import from a workflow registry file - client-bundled, see that AC
// document's AC8 item 30 (this file imports nothing from
// @/lib/supabase/server, @/app/actions/shared, or next/headers, and never
// will: everything below is synchronous and side-effect-free):
//
//   buildAnnouncementSchedule - the WHOLE-TERM calendar. One slot per
//   in-session week, each anchored to the CHOSEN weekday via the existing
//   dateForWeekday helper (course-calendar-dates.ts), the exact way
//   buildCourseEvents already computes a class meeting's date
//   (course-calendar-events.ts:189). No new date arithmetic - see the AC
//   document's "Vetted existing code" section.
//
//   planAnnouncements - the IDEMPOTENCY layer (AC3). Given the desired
//   schedule, whatever rows the mapping table already has for this course,
//   and "now", decides ONE action per desired week. MUST NEVER FETCH - see
//   AC3 item 12b: the write-ahead insert (item 10) always commits the local
//   row BEFORE Canvas is called, so the mapping table itself never learns
//   whether Canvas has posted an announcement. A caller that wants an
//   accurate `postedAt` has to read it back from Canvas FIRST and merge it
//   into the ExistingAnnouncementRow it passes in here - this function only
//   DECIDES, it never DISCOVERS.
//
// A few smaller pure helpers live here too (findMatchingAnnouncement,
// renderAnnouncementTemplate, formatWeekOutcomeReport) - not required by the
// TDD suite, but used by the server-side reconciler
// (src/app/actions/canvas-inbox.ts's scheduleWeeklyAnnouncementsAction) and
// kept pure/here rather than inline so they stay unit-testable the same way.
import { dateForWeekday } from "@/lib/course-calendar-dates";

/** Default local time-of-day every scheduled announcement posts at when no
 * time is given, matching weekStartDate's own "one consistent daypart"
 * convention (registry/weekly-generator.ts) rather than inheriting the
 * course start date's own time of day (typically local midnight - see
 * parseCourseDate, course-calendar-dates.ts). The step's own "Post time"
 * input is OPTIONAL and defaults to exactly this, so leaving it blank
 * reproduces this feature's original (pre-configurable-time) behavior byte
 * for byte. */
export const DEFAULT_POST_HOUR = 8;
export const DEFAULT_POST_MINUTE = 0;

/** One desired week's target post time - week 1 is anchored to an ABSOLUTE
 * date, never a week-1-relative offset (see the "ANCHORS week 1" test in
 * announcement-schedule.test.ts, written specifically to catch a whole-
 * week-shifted implementation every other assertion in that file is
 * invariant under). */
export interface AnnouncementSlot {
  week: number;
  postAt: Date;
}

/** Concrete hour/minute a "Post time" input resolves to. */
export interface PostTime {
  hour: number;
  minute: number;
}

/**
 * Parses a 24-hour "HH:MM" time-of-day string (the step's optional "Post
 * time" input) into a concrete hour/minute, falling back to
 * DEFAULT_POST_HOUR:DEFAULT_POST_MINUTE when the input is blank OR cannot be
 * parsed as a valid 24-hour time - a mistyped time degrades the same way an
 * invalid start date already does elsewhere in this codebase (steps.weekly-
 * announcements.ts's own startDateInvalid handling): to the same state as
 * "nothing was given," never a thrown error over a scheduling feature that
 * should keep working.
 */
export function parsePostTime(raw: string | undefined | null): PostTime {
  const trimmed = (raw ?? "").trim();
  const match = trimmed.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return { hour: DEFAULT_POST_HOUR, minute: DEFAULT_POST_MINUTE };
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

/**
 * One slot per in-session week (1..weekCount), each week's date computed by
 * `dateForWeekday(start, week, weekday)` - the SAME helper buildCourseEvents
 * already uses per week/weekday (course-calendar-events.ts:189), so the
 * class-meeting calendar and this feature's announcement calendar can never
 * silently disagree about what "week N" means. `weekday` is a plain
 * Date.getDay() value (0=Sunday..6=Saturday): stable and locale-
 * independent, unlike a weekday NAME, and independent of whatever weekday
 * the course's own start date happens to fall on (AC1 item 1 - the reason
 * this feature cannot reuse the existing generate-weekly-announcements
 * step, which inherits the start date's weekday via weekStartDate).
 *
 * `postTime` is OPTIONAL and defaults to DEFAULT_POST_HOUR:DEFAULT_POST_MINUTE
 * - every slot uses the SAME time of day (an instructor picks one release
 * hour for the whole term, not a different one per week).
 *
 * `weekCount` <= 0 returns [] - there is no such thing as a negative or
 * zero-length term.
 */
export function buildAnnouncementSchedule(
  start: Date,
  weekCount: number,
  weekday: number,
  postTime?: PostTime
): AnnouncementSlot[] {
  const hour = postTime?.hour ?? DEFAULT_POST_HOUR;
  const minute = postTime?.minute ?? DEFAULT_POST_MINUTE;
  const slots: AnnouncementSlot[] = [];
  for (let week = 1; week <= weekCount; week += 1) {
    const postAt = dateForWeekday(start, week, weekday);
    postAt.setHours(hour, minute, 0, 0);
    slots.push({ week, postAt });
  }
  return slots;
}

/**
 * One row of the weekly_announcement_schedule mapping table (AC3 item 8), as
 * far as planAnnouncements needs to know about it. `postedAt` is
 * deliberately Canvas-sourced ONLY - see this module's own header comment;
 * the mapping table never stores it, a caller merges it in from a read-back
 * before calling planAnnouncements. `scheduledFor` is the date WE most
 * recently told Canvas to use (null on a pending row that never recorded a
 * target date, or - AC3 item 12c - on a confirmed row whose date was, for
 * whatever reason, never recorded).
 */
export interface ExistingAnnouncementRow {
  weekNumber: number;
  status: "pending" | "confirmed";
  topicId: number | null;
  postedAt: string | null;
  scheduledFor: string | null;
  /** The title Canvas actually carries for this row's announcement, when
   * known - OPTIONAL so no existing construction site breaks. Used only by
   * the caller's resolve-pending content match (findMatchingAnnouncement),
   * never by this pure planning layer, which stays unaware of drafted
   * titles entirely (docs/weekly-announcement-module-content-acceptance-
   * criteria.md AC4 item 19). */
  title?: string | null;
}

export type AnnouncementPlanAction =
  | "create"
  | "already-present"
  | "skip-past"
  | "reschedule"
  | "leave-posted"
  | "resolve-pending";

/** One decided action for one desired week - the ONLY output of the
 * planning layer. Every actual Canvas/DB effect lives in the caller, never
 * here. */
export interface AnnouncementPlanEntry {
  week: number;
  action: AnnouncementPlanAction;
  /** This week's desired post time (from the caller's own schedule) - the
   * value a "create" or "reschedule" action should send to Canvas. */
  postAt: Date;
  /** The stored row this decision was made against, when one exists. */
  existing: ExistingAnnouncementRow | null;
  /** Human-readable justification for the report (AC9) - never used for
   * control flow, only for display. */
  reason: string;
}

/**
 * Decide one action per desired week (AC3). PURE: no fetch, no Date.now() -
 * `now` is injected so a caller (and this suite) can pin "the present"
 * exactly. See this module's header comment for why `postedAt` on the
 * incoming rows must already be Canvas-sourced by the time it reaches here.
 *
 * Precedence (AC3 item 12a - items 6 and 12 both apply to the ordinary
 * mid-term re-run, where a week can be BOTH behind us and already
 * scheduled): an existing row always wins over "past". Past-ness is
 * consulted ONLY on the "nothing exists yet" branch.
 *
 * Returns exactly one entry per entry of `slots`, in `slots` order - a
 * stored row for a week outside `slots` (the term shortened, or a stale
 * row) is simply never looked at.
 */
export function planAnnouncements(
  slots: AnnouncementSlot[],
  existing: ExistingAnnouncementRow[],
  now: Date
): AnnouncementPlanEntry[] {
  const byWeek = new Map(existing.map((row) => [row.weekNumber, row]));

  return slots.map((slot): AnnouncementPlanEntry => {
    const row = byWeek.get(slot.week) ?? null;

    if (!row) {
      if (slot.postAt.getTime() <= now.getTime()) {
        return {
          week: slot.week,
          action: "skip-past",
          postAt: slot.postAt,
          existing: null,
          reason: `Week ${slot.week}'s release date (${slot.postAt.toLocaleString()}) is already in the past - not created.`,
        };
      }
      return {
        week: slot.week,
        action: "create",
        postAt: slot.postAt,
        existing: null,
        reason: `Not yet scheduled - will be created for ${slot.postAt.toLocaleString()}.`,
      };
    }

    // AC3 item 11: a pending row (the crash may have landed either side of
    // Canvas's create) is ambiguous, never a licence to blindly re-create -
    // resolved by a targeted read-back in the caller, whether or not it
    // already carries a topic id from a create whose confirm write never
    // landed.
    if (row.status === "pending") {
      return {
        week: slot.week,
        action: "resolve-pending",
        postAt: slot.postAt,
        existing: row,
        reason: `A previous run left week ${slot.week} pending - resolving against Canvas before deciding.`,
      };
    }

    // AC6 item 23: an already-posted announcement is never modified, no
    // matter how far its recorded schedule has drifted from today's slot.
    if (row.postedAt) {
      return {
        week: slot.week,
        action: "leave-posted",
        postAt: slot.postAt,
        existing: row,
        reason: `Week ${slot.week} already posted on Canvas (${row.postedAt}) - left unchanged.`,
      };
    }

    // Confirmed, not yet posted: matches today's desired date -> already
    // present; anything else (including a never-recorded date, AC3 item
    // 12c) -> reschedule, never re-create - rewriting delayed_post_at on a
    // known topic id is safe and idempotent, creating is not.
    const recordedMs = row.scheduledFor ? new Date(row.scheduledFor).getTime() : null;
    if (recordedMs !== null && recordedMs === slot.postAt.getTime()) {
      return {
        week: slot.week,
        action: "already-present",
        postAt: slot.postAt,
        existing: row,
        reason: `Week ${slot.week} is already scheduled for ${slot.postAt.toLocaleString()}.`,
      };
    }
    return {
      week: slot.week,
      action: "reschedule",
      postAt: slot.postAt,
      existing: row,
      reason:
        recordedMs === null
          ? `Week ${slot.week}'s recorded schedule date is missing - rescheduling topic ${row.topicId ?? "?"} to ${slot.postAt.toLocaleString()}.`
          : `Week ${slot.week}'s date changed - rescheduling topic ${row.topicId ?? "?"} to ${slot.postAt.toLocaleString()}.`,
    };
  });
}

// ── Small pure helpers used by the server-side reconciler ──────────────────
// (src/app/actions/canvas-inbox.ts's scheduleWeeklyAnnouncementsAction).
// None of these are required by the TDD suite; kept here (rather than
// inline in the "use server" action) so they stay independently
// unit-testable - see src/lib/announcement-schedule.additional.test.ts.

/** The minimal shape findMatchingAnnouncement needs from a live Canvas
 * announcement - a structural subset of CanvasAnnouncement
 * (src/lib/canvas/announcements.ts), kept local so this module never needs
 * to import that one (avoiding any risk of a dependency cycle, and keeping
 * this file's own import list exactly what AC8 item 30's guard test
 * expects). */
export interface CanvasAnnouncementLike {
  id: number;
  title: string;
  postedAt: string | null;
  delayedPostAt: string | null;
}

/**
 * Best-effort correlation of a locally pending row that never learned a
 * Canvas topic id (AC3 item 11's "the crash landed before the response
 * returned" case) to an existing Canvas announcement. Canvas offers nothing
 * to correlate on directly - no client idempotency key, no external id, no
 * SIS id for discussion topics (see this feature's AC3 preamble) - so this
 * matches on an EXACT (trimmed, case-insensitive) title plus a scheduled
 * time within `toleranceMs` of `expectedPostAt`, checked against whichever
 * of delayedPostAt/postedAt the candidate actually has (an announcement that
 * has since posted may have lost its delayedPostAt). Returns null on no
 * match, which the caller treats as "the earlier attempt never reached
 * Canvas - safe to create."
 */
export function findMatchingAnnouncement<T extends CanvasAnnouncementLike>(
  announcements: T[],
  expectedTitle: string,
  expectedPostAt: Date,
  toleranceMs = 24 * 60 * 60 * 1000
): T | null {
  const wantTitle = expectedTitle.trim().toLowerCase();
  const wantMs = expectedPostAt.getTime();
  for (const candidate of announcements) {
    if ((candidate.title ?? "").trim().toLowerCase() !== wantTitle) continue;
    const candidateIso = candidate.delayedPostAt ?? candidate.postedAt;
    if (!candidateIso) continue;
    const candidateMs = new Date(candidateIso).getTime();
    if (Number.isNaN(candidateMs)) continue;
    if (Math.abs(candidateMs - wantMs) <= toleranceMs) return candidate;
  }
  return null;
}

/** Substitutes every `{week}` in a title/message template with the week
 * number - the only "content authoring" this feature does (it never calls
 * an LLM: the AC document requires this step run standalone, against a bare
 * course tile, so there is no generated module material to ground an
 * LLM-written announcement in - see the AC document's "Relationship to the
 * existing step", gap (c)). */
export function renderAnnouncementTemplate(template: string, week: number): string {
  return template.replace(/\{week\}/gi, String(week));
}

/** One reported week's outcome, generic over whatever status vocabulary the
 * caller uses (the PLANNED action from planAnnouncements, or the actual
 * EXECUTED outcome from scheduleWeeklyAnnouncementsAction - the two can
 * diverge, e.g. a "create" that fails, or a "resolve-pending" that splits
 * into "found the existing one" vs "had to create it after all"). */
export interface AnnouncementWeekReportLine {
  week: number;
  status: string;
  detail: string;
}

/**
 * AC9's per-week report (item 31: every week's status and, for failures,
 * the underlying error - never an aggregate message), plus the standing
 * disclosure (AC2 item 7 / AC9 item 32) that break weeks were never
 * excluded. Stated ONCE at the end rather than once per week, so a long
 * term's report is not buried under N identical notes.
 */
export function formatWeekOutcomeReport(results: AnnouncementWeekReportLine[]): string {
  const lines = results.map((r) => `Week ${r.week}: ${r.status} - ${r.detail}`);
  lines.push(
    "Note: this run does not exclude break weeks - every in-session week 1..N was scheduled with no break awareness."
  );
  return lines.join("\n");
}

// ── Email-copy resolution (AC4, docs/weekly-announcement-package-io-
// acceptance-criteria.md) ───────────────────────────────────────────────────
//
// Canvas's own discussion-topic create endpoint accepts NO notification
// parameter at all. Its API_ALLOWED_TOPIC_FIELDS
// (app/controllers/discussion_topics_controller.rb) is exactly:
//   title message discussion_type delayed_post_at lock_at podcast_enabled
//   podcast_has_student_posts require_initial_post pinned todo_date
//   group_category_id allow_rating only_graders_can_rate sort_by_rating
//   anonymous_state is_anonymous_author
// - there is no notify_users, no send_notification and no
// notification_overrides anywhere in Canvas's discussion controllers.
// Canvas notifies students from its own New Announcement notification at
// post time, per each student's own notification preferences - never per
// announcement. Do NOT "fix" the Canvas branch below by inventing a request
// parameter to send: there is none, and sending an unrecognized field would
// not do anything either.

/**
 * Resolves the step's "Email a copy to students" (`emailCopy`) input into
 * what actually happens for a given target LMS (AC4 item 25). This is the
 * ONLY place in the codebase that decides what the choice means.
 *
 * `choice` is the raw stored input value - "" (use each student's own
 * notification settings, the default), "1" (email a copy) or "0" (do not
 * email a copy). It is trimmed; any unrecognized value resolves as "" the
 * same way every other select-backed text input in this codebase tolerates
 * an unrecognized stored value.
 *
 * `lms` is the resolved target LMS string; this function lowercase-
 * normalizes it itself (trim + toLowerCase), so callers can pass whatever
 * casing the resolved LMS happens to carry.
 *
 * For a Canvas target the choice is never honored (see the header comment
 * above): `honored: false`, `value: null`, and a note stating why, verbatim,
 * regardless of which choice was stored. For every other LMS - including an
 * unknown/blank target - the choice IS honored and `value` reflects it.
 */
export function resolveAnnouncementEmailCopy(
  lms: string,
  choice: string
): { value: boolean | null; honored: boolean; note: string } {
  const normalizedLms = lms.trim().toLowerCase();
  const trimmedChoice = choice.trim();
  const normalizedChoice = trimmedChoice === "1" || trimmedChoice === "0" ? trimmedChoice : "";

  if (normalizedLms === "canvas") {
    return {
      value: null,
      honored: false,
      note:
        "Canvas has no per-announcement email setting - students are notified by their own Canvas notification preferences when each week posts.",
    };
  }

  if (normalizedChoice === "1") {
    return {
      value: true,
      honored: true,
      note: "Recorded: students will be emailed a copy of each announcement.",
    };
  }
  if (normalizedChoice === "0") {
    return {
      value: false,
      honored: true,
      note: "Recorded: students will not be emailed a copy of each announcement.",
    };
  }
  return {
    value: null,
    honored: true,
    note: "Recorded: students are notified by their own LMS notification settings.",
  };
}
