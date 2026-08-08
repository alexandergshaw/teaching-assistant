// Client-side step catalog: the WEEKLY ANNOUNCEMENT SCHEDULING sibling step
// (docs/weekly-announcement-scheduling-acceptance-criteria.md). Pre-
// schedules a weekly announcement on a chosen weekday for every in-session
// week of a term, IN ONE RUN: each week's announcement is created
// immediately, carrying a future delayed_post_at so Canvas posts it on that
// weekday - this is NOT a recurring schedule that fires weekly (see the AC
// document's own "Mechanism" note).
//
// A DELIBERATE SIBLING of generate-weekly-announcements
// (steps.weekly-announcements.ts), not a replacement or an extension of it:
// that step REQUIRES generated module materials (it grounds each
// announcement in that week's actual objectives/deck/opener/assignment -
// docs/REGRESSION.md #157 AC6) and derives its release date from
// weekStartDate (the course start date's OWN weekday, never a chosen one).
// This step runs standalone against a bare course tile (no Course Build
// materials needed), and its whole reason to exist is a CHOSEN weekday
// (AC1) - so it cannot be built by extending the existing step, and the
// existing step's inputs/behavior/preset bindings are left completely
// UNCHANGED by this file (AC10).
//
// EXTENDED by docs/weekly-announcement-module-content-acceptance-criteria.md:
// each week's announcement is now DRAFTED from that week's Canvas module
// content by default (AC1/AC2), with the message input as the fallback
// (AC3). The mechanism above - one run, the whole term, up front - is
// unchanged; only what each week says changed.
//
// Every Canvas call and every mapping-table read/write lives behind server
// actions (scheduleWeeklyAnnouncementsAction, planWeeklyAnnouncementsAction,
// draftModuleAnnouncementsAction - all @/app/actions) - this file only
// plans, asks for ONE gather-and-draft call, and renders the report the
// scheduling action returns. That keeps this registry file (client-bundled
// - see the AC document's AC8 item 30) free of any @/lib/supabase/server,
// @/app/actions/shared, or next/headers import, even transitively;
// steps.weekly-announcement-schedule.test.ts (modeled on
// course-schedule-docx.test.ts:40-48) reads this file's own source and
// asserts those imports never appear.
//
// The per-week drafting loop deliberately does NOT live in this file. Next
// serializes client-dispatched Server Functions
// (node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md:206:
// "The client currently dispatches and awaits them one at a time..."), so a
// call per week issued from here would run strictly one at a time and blow
// the unattended 60-second cap. Drafting is therefore ONE call to
// draftModuleAnnouncementsAction, which loops server-side with its own time
// budget (module-content-acceptance-criteria.md's revision note).
import {
  listCourseHubAction,
  scheduleWeeklyAnnouncementsAction,
  planWeeklyAnnouncementsAction,
  draftModuleAnnouncementsAction,
} from "@/app/actions";
import { type StepDefinition } from "@/lib/workflows/registry-helpers";
import { resolveLmsFromTile, isCanvasLms, canvasOnlySkipText } from "@/lib/workflows/registry/lms-target-guard";

const WEEKDAY_OPTIONS = ["0", "1", "2", "3", "4", "5", "6"];
const WEEKDAY_LABELS: Record<string, string> = {
  "0": "Sunday",
  "1": "Monday",
  "2": "Tuesday",
  "3": "Wednesday",
  "4": "Thursday",
  "5": "Friday",
  "6": "Saturday",
};

// The select's two values, per AC6 item 24a. "" (blank) is the default and
// MUST be a member of `options`: RuntimeFieldInput.tsx:259-291 renders a
// "text" input carrying `options` as a MUI select whose MenuItems are
// exactly `field.options` - an options array that omitted the stored
// default would render an empty control with an out-of-range warning.
const DRAFT_FROM_OPTIONS = ["", "template"];
const DRAFT_FROM_LABELS: Record<string, string> = {
  "": "Canvas module content (recommended)",
  template: "The message below, for every week",
};

// Local mirrors of shapes owned by files other agents are building
// (@/app/actions/weekly-announcement-drafting.ts, canvas-inbox.ts). Kept
// here as plain structural types, rather than imported, so this file's only
// import stays "@/app/actions" - the client-bundle guard test above checks
// for that exact string.
type WeekPlanAction = "create" | "already-present" | "skip-past" | "reschedule" | "leave-posted" | "resolve-pending";
type WeekPlanEntry = { week: number; action: WeekPlanAction };
type WeeklyAnnouncementDraft = {
  week: number;
  title?: string;
  message?: string;
  note?: string;
  defer?: boolean;
};

export const weeklyAnnouncementScheduleSteps: StepDefinition[] = [
  {
    type: "schedule-weekly-announcements-for-term",
    name: "Schedule weekly announcements for the term",
    description:
      "Pre-schedule one announcement per in-session week (weeks 1..N, from the course tile's start date and week count) on a chosen weekday, for the WHOLE TERM in one run. By default each week's announcement is drafted from that week's Canvas module content; the message below is used as a fallback whenever a week has no module content or its draft fails, or as every week's text when \"Draft from\" is set to the message instead. Each week's announcement is created immediately in Canvas with a future release date, so nothing appears to students until its own week - this is not a recurring schedule that fires weekly. Safe to re-run: already-scheduled weeks are left alone and reported as such, and a start-date edit reschedules existing weeks instead of duplicating the term. Break weeks are NOT excluded - every in-session week is scheduled regardless of breaks.",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: true,
        help: "Its start date and week count set the term; its LMS course is where announcements are scheduled.",
      },
      {
        key: "weekday",
        label: "Post on",
        type: "text",
        required: true,
        options: WEEKDAY_OPTIONS,
        optionLabels: WEEKDAY_LABELS,
        help: "Every week's announcement is scheduled for this weekday, independent of the course start date's own weekday.",
      },
      {
        key: "postTime",
        label: "Post time (optional)",
        type: "text",
        required: false,
        help: '24-hour "HH:MM", e.g. "09:30" for a class that meets at 9:30am. Leave blank to post at 8:00 AM.',
      },
      {
        key: "draftFrom",
        label: "Draft from",
        type: "text",
        required: false,
        options: DRAFT_FROM_OPTIONS,
        optionLabels: DRAFT_FROM_LABELS,
        // DEFECT 5 fix: a File item contributes only its header line (its
        // name), never a download or preview of its body - a deliberate
        // design decision (entry 238 check 10) - so this text must not
        // promise "File content" alongside the item types that really are
        // read in full.
        help: 'Leave as "Canvas module content" to have each week\'s announcement drafted from that week\'s Page/Assignment/Quiz/Discussion content (files are named, not read). Choose the other option to post the message below unchanged for every week instead.',
      },
      {
        key: "title",
        label: "Title",
        type: "text",
        required: false,
        requiredWhen: { fieldKey: "draftFrom", equals: "template" },
        help: 'Optional. When drafting from module content, overrides the drafted title for every week (use {week} for the week number) - leave blank to use each week\'s drafted title, or "Week N" when none was drafted. Required when "Draft from" is set to the message below, since it is the only title that would ever be posted.',
      },
      {
        key: "message",
        label: "Message",
        type: "longtext",
        required: false,
        requiredWhen: { fieldKey: "draftFrom", equals: "template" },
        help: 'Optional when drafting from module content: used only as the fallback for a week with no module content or a failed draft. Required when "Draft from" is set to the message below, since it is posted for every week (use {week} for the week number).',
      },
      {
        key: "extraNotes",
        label: "Extra notes (optional)",
        type: "longtext",
        required: false,
        help: "Folded into every week's drafted announcement - a reminder, a policy note, anything the module content itself will not mention. Ignored when posting the message template.",
      },
    ],
    outputs: [
      { key: "scheduledCount", label: "Newly scheduled this run", type: "number" },
      { key: "report", label: "Report", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const hubCourseId = String(values.hubCourse ?? "").trim();
      if (!hubCourseId) {
        throw new Error("Choose a course tile.");
      }

      const weekdayRaw = String(values.weekday ?? "").trim();
      if (!WEEKDAY_OPTIONS.includes(weekdayRaw)) {
        throw new Error("Choose a weekday to post on.");
      }
      const weekday = Number.parseInt(weekdayRaw, 10);
      const postTime = String(values.postTime ?? "").trim();

      const title = String(values.title ?? "").trim();
      const message = String(values.message ?? "").trim();
      const extraNotes = String(values.extraNotes ?? "").trim() || undefined;

      // Blank means module content - the new default (AC6 item 24a/29).
      // "template" is the one opt-out value; anything else typed into the
      // stored value falls back to module mode the same way an unrecognized
      // option would for any other select-backed text input here.
      //
      // Deliberately TRIMMED here, unlike the run form's requiredWhen gate
      // on title/message (isFieldRequired, workflow-field-visibility.ts),
      // which compares this same value with an EXACT, untrimmed match. A
      // stored " template " is not pre-blocked by the Run button, so it
      // falls through to this step's own check below - the same throw that
      // shipped before the gate existed. That asymmetry is intentional: the
      // alternative is matching the gate's exact comparison here, which
      // would silently resolve a padded value to module mode and post
      // drafted announcements in place of the instructor's template.
      // Unreachable through the select today (DRAFT_FROM_OPTIONS only ever
      // stores "" or "template"), so the tolerance costs nothing here.
      const draftFrom = String(values.draftFrom ?? "").trim();
      const mode: "template" | "module" = draftFrom === "template" ? "template" : "module";

      // Template mode has nothing else to post, so it keeps the ORIGINAL
      // unconditional check, at its original position (before the course
      // tile is even looked up) - module mode requires neither (AC4 item
      // 17): the action rejects a blank title when drafting is off, and
      // this step must not surface that as a raw error.
      if (mode === "template" && (!title || !message)) {
        throw new Error("Provide a title and message for the announcement.");
      }

      const list = await listCourseHubAction();
      if ("error" in list) {
        throw new Error(list.error);
      }
      const tile = list.courses.find((c) => c.id === hubCourseId);
      if (!tile) {
        throw new Error("Choose a course tile.");
      }

      // Canvas-only guard, BEFORE any database write: this step's Canvas
      // calls go through canvas-core.ts's resolveCourse, which THROWS on a
      // non-Canvas course URL - and a Blackboard tile's canvasUrl field is
      // NOT blank (docs/REGRESSION.md #218, #229 - it holds the Blackboard
      // URL), so the old `!tile.canvasUrl` check below could never catch
      // it. Checking the tile's own `lms` field first (the same
      // authoritative signal lms-modules.ts/lms-populate/lms-wipe/
      // lms-assignments already use via lms-target-guard.ts) catches a
      // Blackboard/Brightspace/etc. tile and returns a clean, successful
      // skip - never reaching planWeeklyAnnouncementsAction,
      // draftModuleAnnouncementsAction or scheduleWeeklyAnnouncementsAction,
      // so no pending row is ever written for a course this step can never
      // serve.
      const tileLms = await resolveLmsFromTile(tile, helpers);
      if (!isCanvasLms(tileLms)) {
        const text = canvasOnlySkipText(tileLms);
        return {
          outputs: { scheduledCount: 0, report: text },
          summary: { kind: "text", text },
        };
      }

      if (!tile.canvasUrl) {
        throw new Error("The course tile has no LMS course linked.");
      }
      if (!tile.startDate) {
        throw new Error("The course tile has no start date set.");
      }
      if (!tile.weeks || tile.weeks <= 0) {
        throw new Error("The course tile has no number of weeks set.");
      }

      const acronym = tile.institution || helpers.activeInstitution || undefined;
      onProgress(`Scheduling weekly announcements for ${tile.name}...`);

      let drafts: WeeklyAnnouncementDraft[] | undefined;

      if (mode === "module") {
        // ONE plan call decides what needs a draft; ONE gather-and-draft
        // call does the work (AC2 item 7). A planning failure must never
        // cost the user the run - scheduleWeeklyAnnouncementsAction
        // re-plans from scratch (AC5 item 23) and will report the same
        // failure per week, just without a drafted head start.
        let planWeeks: WeekPlanEntry[] = [];
        try {
          const plan = (await planWeeklyAnnouncementsAction(
            tile.id,
            tile.canvasUrl,
            acronym,
            tile.startDate,
            tile.weeks,
            weekday,
            postTime
          )) as { weeks: WeekPlanEntry[] } | { error: string } | null | undefined;
          if (plan && !("error" in plan)) {
            planWeeks = plan.weeks;
          }
        } catch {
          planWeeks = [];
        }

        // A reschedule only moves a date and must NEVER be re-drafted (AC5
        // item 22). already-present/skip-past/leave-posted need no text
        // either. resolve-pending may still have to create, so it DOES.
        const weeksNeedingText = planWeeks
          .filter((w) => w.action === "create" || w.action === "resolve-pending")
          .map((w) => w.week);

        // Nothing to draft is what makes a re-run against a fully
        // scheduled term cost zero LLM calls (AC1 item 6) - no draft call
        // at all, not a call asking for zero weeks.
        if (weeksNeedingText.length > 0) {
          onProgress(
            `Drafting ${weeksNeedingText.length} week announcement${weeksNeedingText.length === 1 ? "" : "s"} from module content...`
          );
          try {
            const drafted = (await draftModuleAnnouncementsAction(
              tile.canvasUrl,
              weeksNeedingText,
              tile.weeks,
              acronym,
              { provider: helpers.provider, courseName: tile.name, extraNotes }
            )) as { drafts: WeeklyAnnouncementDraft[] } | { error: string } | null | undefined;
            if (drafted && !("error" in drafted)) {
              drafts = drafted.drafts;
            }
            // Drafting never blocks scheduling (AC2 item 11): an { error }
            // here just leaves `drafts` unset and every week falls back to
            // the message template inside scheduleWeeklyAnnouncementsAction.
          } catch {
            drafts = undefined;
          }
        }
      }

      // Template mode calls exactly as before this feature existed - no
      // trailing arguments, no plan call, no draft call (AC3 item 14:
      // byte-for-byte the original behavior). Module mode ALWAYS appends the
      // (unused) testOverrides slot and a drafts option, even an empty one:
      // the action reads the option's PRESENCE (not its contents) as "resolve
      // per week", and its ABSENCE as "template mode, both templates
      // required" (AC3 item 15). `drafts` is undefined on several reachable
      // module-mode paths - a fully scheduled term, a term entirely in the
      // past, a start-date edit that only reschedules, or a planning/drafting
      // failure - and conditionally omitting the option on those paths would
      // fall through into template mode's blanket rejection, breaking the
      // "safe to re-run" guarantee (entry 236 check 4). Do not reintroduce a
      // conditional spread here.
      const result =
        mode === "template"
          ? await scheduleWeeklyAnnouncementsAction(
              tile.id,
              tile.canvasUrl,
              acronym,
              tile.startDate,
              tile.weeks,
              weekday,
              postTime,
              title,
              message
            )
          : await scheduleWeeklyAnnouncementsAction(
              tile.id,
              tile.canvasUrl,
              acronym,
              tile.startDate,
              tile.weeks,
              weekday,
              postTime,
              title,
              message,
              undefined,
              { drafts: drafts ?? [] }
            );
      if ("error" in result) {
        throw new Error(result.error);
      }

      const { result: run } = result;
      const scheduledCount = run.createdCount + run.resolvedCreatedCount;

      return {
        outputs: {
          scheduledCount,
          report: run.report,
        },
        summary: {
          kind: "list",
          label: `${scheduledCount + run.rescheduledCount} week(s) updated in Canvas${run.stoppedEarly ? " - stopped early on the time budget, re-run to finish" : ""}`,
          items: run.lines,
        },
      };
    },
  },
];
