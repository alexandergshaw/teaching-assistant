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
// Every Canvas call and every mapping-table read/write lives behind ONE
// server action (scheduleWeeklyAnnouncementsAction,
// @/app/actions/canvas-inbox.ts) - this file only resolves the course tile
// and renders the report that action returns. That keeps this registry file
// (client-bundled - see the AC document's AC8 item 30) free of any
// @/lib/supabase/server, @/app/actions/shared, or next/headers import, even
// transitively; steps.weekly-announcement-schedule.test.ts (modeled on
// course-schedule-docx.test.ts:40-48) reads this file's own source and
// asserts those imports never appear.
import { listCourseHubAction, scheduleWeeklyAnnouncementsAction } from "@/app/actions";
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

export const weeklyAnnouncementScheduleSteps: StepDefinition[] = [
  {
    type: "schedule-weekly-announcements-for-term",
    name: "Schedule weekly announcements for the term",
    description:
      "Pre-schedule one announcement per in-session week (weeks 1..N, from the course tile's start date and week count) on a chosen weekday, for the WHOLE TERM in one run. Each week's announcement is created immediately in Canvas with a future release date, so nothing appears to students until its own week - this is not a recurring schedule that fires weekly. Safe to re-run: already-scheduled weeks are left alone and reported as such, and a start-date edit reschedules existing weeks instead of duplicating the term. Break weeks are NOT excluded - every in-session week is scheduled regardless of breaks.",
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
        key: "title",
        label: "Title",
        type: "text",
        required: true,
        help: 'Use {week} to insert the week number, e.g. "Week {week}".',
      },
      {
        key: "message",
        label: "Message",
        type: "longtext",
        required: true,
        help: "Posted for every scheduled week; use {week} to insert the week number.",
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
      if (!title || !message) {
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
      // skip - never reaching scheduleWeeklyAnnouncementsAction, so no
      // pending row is ever written for a course this step can never serve.
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

      onProgress(`Scheduling weekly announcements for ${tile.name}...`);
      const acronym = tile.institution || helpers.activeInstitution || undefined;
      const result = await scheduleWeeklyAnnouncementsAction(
        tile.id,
        tile.canvasUrl,
        acronym,
        tile.startDate,
        tile.weeks,
        weekday,
        postTime,
        title,
        message
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
