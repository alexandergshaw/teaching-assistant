// Client-side step catalog: step definitions that run workflows.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  listCourseHubAction,
  updateCourseHubAction,
  listCourseContentAction,
  setModuleDueDatesAction,
} from "@/app/actions";
import {
  type StepDefinition,
  courseToInputPayload,
  weekDeadline,
} from "@/lib/workflows/registry-helpers";
import type { DueDateUpdate } from "@/lib/canvas-modules";

export const courseSetupTimelineSteps: StepDefinition[] = [
  {
    type: "set-course-start-dates",
    name: "Set course start dates",
    description:
      "Store the given start date on every selected course tile.",
    inputs: [
      {
        key: "startDate",
        label: "Course start",
        type: "date",
        required: true,
      },
      {
        key: "courses",
        label: "Courses",
        type: "hubCourseList",
        required: true,
      },
    ],
    outputs: [{ key: "courses", label: "Courses", type: "hubCourseList" }],
    run: async (values, helpers, onProgress) => {
      const startRaw = String(values.startDate ?? "").trim();
      const start = startRaw ? new Date(`${startRaw}T00:00:00`) : null;
      if (!start || Number.isNaN(start.getTime())) {
        throw new Error("Enter the course start as a valid date.");
      }

      const ids = String(values.courses ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const hub = await listCourseHubAction();
      if ("error" in hub) {
        throw new Error(hub.error);
      }

      const lines: string[] = [];
      let updated = 0;
      let failed = 0;

      for (const id of ids) {
        const tile = hub.courses.find((c) => c.id === id);
        // Fail-forward: one bad tile records its error and the loop moves on.
        try {
          if (!tile) {
            lines.push(`${id}: not found`);
            failed++;
            continue;
          }

          onProgress(`Updating ${tile.name}...`);
          const r = await updateCourseHubAction(id, {
            ...courseToInputPayload(tile),
            startDate: startRaw,
          });
          if ("error" in r) {
            throw new Error(r.error);
          }

          lines.push(`${tile.name}: start date set`);
          updated++;
        } catch (err) {
          lines.push(
            `${tile?.name ?? id}: ${
              err instanceof Error ? err.message : "failed"
            }`
          );
          failed++;
        }
      }

      return {
        outputs: { courses: values.courses },
        summary: {
          kind: "list",
          label: `${updated} start date(s) set${
            failed ? `, ${failed} failed` : ""
          }`,
          items: lines,
        },
      };
    },
  },

  {
    type: "assign-week-deadlines",
    name: "Assign weekly deadlines",
    description:
      "Give every module's assignments, quizzes, and discussions a deadline at the Sunday ending its week; Start Here and Module 1 end week one.",
    inputs: [
      {
        key: "courses",
        label: "Courses",
        type: "hubCourseList",
        required: true,
      },
      {
        key: "startDate",
        label: "Course start",
        type: "date",
        required: true,
      },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const startRaw = String(values.startDate ?? "").trim();
      const start = startRaw ? new Date(`${startRaw}T00:00:00`) : null;
      if (!start || Number.isNaN(start.getTime())) {
        throw new Error("Enter the course start as a valid date.");
      }


      const ids = String(values.courses ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const hub = await listCourseHubAction();
      if ("error" in hub) {
        throw new Error(hub.error);
      }

      const lines: string[] = [];
      let failed = 0;
      let skipped = 0;

      for (const id of ids) {
        const tile = hub.courses.find((c) => c.id === id);
        // Fail-forward: one bad course records its error and the loop moves on.
        try {
          if (!tile) {
            lines.push(`${id}: not found`);
            failed++;
            continue;
          }

          const canvasUrl = (tile.canvasUrl ?? "").trim();
          if (!canvasUrl) {
            lines.push(`${tile.name}: no LMS course on the tile - skipped`);
            skipped++;
            continue;
          }

          const inst = tile.institution?.trim() || helpers.activeInstitution || undefined;

          onProgress(`Loading modules for ${tile.name}...`);
          const content = await listCourseContentAction(
            canvasUrl,
            inst
          );
          if ("error" in content) {
            throw new Error(content.error);
          }

          // Each module's week comes from its OWN name - "Start Here" maps
          // to week 1 and "Module NN" to N - never from list position, so
          // extra or reordered modules cannot skew other modules' deadlines.
          // Legacy "Module 00" exports clamp to week one so no deadline can land
          // before the course starts.
          const updates: DueDateUpdate[] = [];
          let moduleCount = 0;
          for (const m of content.modules) {
            let week: number | null = null;
            if (/start\s*here/i.test(m.name)) {
              week = 1;
            } else {
              const wm = m.name.match(/module\s*0*(\d+)/i);
              if (wm) week = Math.max(1, Number(wm[1]));
            }
            if (week === null) continue;

            moduleCount++;
            for (const item of m.items) {
              if (item.contentId === null) continue;
              if (
                item.type !== "Assignment" &&
                item.type !== "Quiz" &&
                item.type !== "Discussion"
              ) {
                continue;
              }
              updates.push({
                type: item.type,
                contentId: item.contentId,
                dueAt: weekDeadline(start, week).toISOString(),
              });
            }
          }

          onProgress(`Setting ${updates.length} deadline(s) in ${tile.name}...`);
          const r = await setModuleDueDatesAction(
            canvasUrl,
            updates,
            inst
          );
          if ("error" in r) {
            throw new Error(r.error);
          }

          lines.push(
            `${tile.name}: ${r.updated} deadline(s) across ${moduleCount} module(s)${
              r.failures.length ? ` (${r.failures.length} failed)` : ""
            }`
          );
        } catch (err) {
          lines.push(
            `${tile?.name ?? id}: ${
              err instanceof Error ? err.message : "failed"
            }`
          );
          failed++;
        }
      }

      return {
        outputs: {},
        summary: {
          kind: "list",
          label: `Assigned deadlines in ${ids.length - failed - skipped} course(s)${
            skipped ? `, ${skipped} skipped` : ""
          }${failed ? `, ${failed} failed` : ""}`,
          items: lines,
        },
      };
    },
  },
];
