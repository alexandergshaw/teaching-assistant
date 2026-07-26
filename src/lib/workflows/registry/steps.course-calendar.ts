// Client-side step catalog: course -> Google Calendar sync step.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import { syncCourseCalendarAction } from "@/app/actions";
import type { StepDefinition } from "@/lib/workflows/registry-helpers";

export const courseCalendarSteps: StepDefinition[] = [
  {
    type: "sync-course-calendar",
    name: "Sync course dates to Google Calendar",
    description:
      "Push a course tile's term, class meetings, estimated tests, and weekly due dates onto a named Google Calendar (default \"Adjuncting\"), idempotently - a re-run only updates or removes the events this sync created, never the calendar's other entries.",
    inputs: [
      { key: "hubCourse", label: "Course tile", type: "hubCourse", required: true },
      {
        key: "calendarName",
        label: "Calendar name",
        type: "text",
        required: false,
        help: 'Defaults to "Adjuncting" - the Google Calendar these events are written to.',
      },
      {
        key: "dryRun",
        label: "Preview only (no writes)",
        type: "boolean",
        required: false,
        help: "When on, reports what would be created, updated, and deleted without changing the calendar.",
      },
    ],
    outputs: [
      { key: "created", label: "Events created", type: "number" },
      { key: "updated", label: "Events updated", type: "number" },
      { key: "deleted", label: "Events deleted", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      const hubCourseId = String(values.hubCourse ?? "").trim();
      if (!hubCourseId) {
        throw new Error("Choose a course.");
      }

      const calendarName = String(values.calendarName ?? "").trim();
      const dryRun = String(values.dryRun ?? "") === "1";

      onProgress(dryRun ? "Previewing the calendar sync..." : "Syncing the course calendar...");
      const result = await syncCourseCalendarAction(hubCourseId, {
        calendarName: calendarName || undefined,
        dryRun,
      });
      if ("error" in result) {
        throw new Error(result.error);
      }

      const summaryItems = [...result.notes];
      if (result.skippedUntagged > 0) {
        summaryItems.push(`${result.skippedUntagged} untagged event(s) on the calendar were left alone`);
      }

      return {
        outputs: {
          created: result.created,
          updated: result.updated,
          deleted: result.deleted,
        },
        summary: {
          kind: "list",
          label: `${result.calendarName}: ${result.created} created, ${result.updated} updated, ${result.deleted} deleted`,
          items: summaryItems,
        },
      };
    },
  },
];
