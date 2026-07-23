import {
  createPageAction,
  createCourseAssignmentAction,
  listCourseContentAction,
  listCourseHubAction,
} from "@/app/actions";
import type { StepDefinition } from "@/lib/workflows/registry-helpers";
import type { ScheduleWeekPlan } from "@/app/actions-types";
import { planWeekItems } from "@/lib/workflows/source-alignment";

export const lmsIntegrationsSteps: StepDefinition[] = [
  {
    type: "integrate-source-into-lms",
    name: "Integrate source material into LMS",
    description:
      "Create LMS pages and assignments for each week mapped to source material chapters",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: true,
      },
      {
        key: "schedule",
        label: "Course schedule",
        type: "schedule",
        required: true,
      },
      {
        key: "sourceMaterial",
        label: "Source material (optional)",
        type: "longtext",
        required: false,
        help: "Source material context from the schedule generation.",
      },
      {
        key: "sourceUrl",
        label: "Source platform URL (optional)",
        type: "text",
        required: false,
        help: "The platform URL where the source material is hosted (e.g., MindTap, uCertify link).",
      },
    ],
    outputs: [
      { key: "pagesCreated", label: "Pages created", type: "number" },
      { key: "assignmentsCreated", label: "Assignments created", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      const hubCourseId = String(values.hubCourse ?? "").trim();
      const schedule = (values.schedule as ScheduleWeekPlan[] | undefined) ?? [];
      const sourceMaterial = String(values.sourceMaterial ?? "").trim();
      const sourceUrl = String(values.sourceUrl ?? "").trim();

      // Load course tile to get canvasUrl
      onProgress("Loading course tile...");
      const hubListResult = await listCourseHubAction();
      if ("error" in hubListResult) {
        return {
          outputs: { pagesCreated: 0, assignmentsCreated: 0 },
          summary: { kind: "text", text: `Could not load course tile: ${hubListResult.error}` },
        };
      }

      const tile = hubListResult.courses.find((c) => c.id === hubCourseId);
      if (!tile) {
        return {
          outputs: { pagesCreated: 0, assignmentsCreated: 0 },
          summary: { kind: "text", text: "Course tile not found." },
        };
      }

      // Gate: require live LMS connection
      const canvasUrl = (tile.canvasUrl ?? "").trim();
      if (!canvasUrl) {
        return {
          outputs: { pagesCreated: 0, assignmentsCreated: 0 },
          summary: {
            kind: "text",
            text: "Skipped: Course tile has no live LMS connection (canvasUrl empty).",
          },
        };
      }

      // Gate: require source material
      if (!sourceMaterial) {
        return {
          outputs: { pagesCreated: 0, assignmentsCreated: 0 },
          summary: {
            kind: "text",
            text: "Skipped: No source material provided. Add source material to the schedule step to enable LMS integration.",
          },
        };
      }

      if (!schedule.length) {
        return {
          outputs: { pagesCreated: 0, assignmentsCreated: 0 },
          summary: {
            kind: "text",
            text: "Skipped: Schedule is empty.",
          },
        };
      }

      let pagesCreated = 0;
      let assignmentsCreated = 0;
      const summaryItems: string[] = [];

      // Plan which weeks need LMS items
      const weekPlans = planWeekItems(schedule);

      // Fetch existing modules (to find each week's module id) and existing
      // page/assignment titles (idempotency: a re-run skips creating anything
      // whose exact title is already present instead of duplicating it).
      let modules: Array<{ id: number; name: string; weeks?: number[] }> = [];
      const existingPageTitles = new Set<string>();
      const existingAssignmentTitles = new Set<string>();
      try {
        const contentResult = await listCourseContentAction(canvasUrl);
        if (!("error" in contentResult)) {
          const moduleData = contentResult.modules ?? [];
          modules = moduleData.map((m) => {
            // lms-modules (steps.lms.ts) names week modules "Module NN"
            // (zero-padded), never "Week N" - this tolerant regex matches
            // both "Module 01" and "Week 1" style names.
            //
            // Binding lms-modules' own `modules` output directly into this
            // step (it already carries a real per-module `week` field, via
            // EnsuredModule) was considered instead of regex-matching names,
            // since it would be exact rather than inferred. It was rejected:
            // NO_CODE_KICKOFF appends this step AFTER an include-workflow
            // step that absorbs course-refresh (which is where lms-modules
            // runs), and expandWorkflowDef's defToExpanded map (types.ts)
            // only records a workflow's OWN top-level step indices - an
            // include-workflow step is deliberately excluded from that map
            // ("Include steps never enter the map: they expand to many
            // steps and expose no outputs, so no def-local binding can
            // validly target one"). So nothing in this preset's own step
            // array has a coordinate that names an absorbed course-refresh
            // step; the only include-facing lever (bindOverrides) rewires an
            // ABSORBED step's own inputs, not a later step's inputs from an
            // absorbed step's outputs. Hard-coding the absorbed step's
            // expanded-array position would "work" today but would silently
            // break the moment course-refresh's step count changes - which
            // defeats the whole point of a dynamically-composed include. The
            // tolerant regex is the documented fallback the AC calls for.
            const weekMatch = m.name?.match(/(?:module|week)\s*0*(\d+)/i);
            const weeks = weekMatch ? [parseInt(weekMatch[1], 10)] : [];
            return {
              id: m.id,
              name: m.name ?? "",
              weeks,
            };
          });

          for (const page of contentResult.pages ?? []) {
            if (page.title) existingPageTitles.add(page.title.trim().toLowerCase());
          }
          for (const m of moduleData) {
            for (const item of m.items ?? []) {
              if (item.type === "Assignment" && item.title) {
                existingAssignmentTitles.add(item.title.trim().toLowerCase());
              }
            }
          }
        }
      } catch (err) {
        summaryItems.push(`Warning: Could not fetch existing modules (${err})`);
      }

      // Helper to find module ID for a week
      const findModuleForWeek = (weekNumber: number): number | null => {
        const foundModule = modules.find((m) => m.weeks?.includes(weekNumber));
        return foundModule ? foundModule.id : null;
      };

      // Process each week
      for (const weekPlan of weekPlans) {
        if (weekPlan.isNonContent) {
          // Skip non-content weeks (review, exam, project)
          continue;
        }

        if (!weekPlan.chapterRef) {
          // Skip weeks without chapter references
          continue;
        }

        const moduleId = findModuleForWeek(weekPlan.week);
        if (moduleId === null) {
          summaryItems.push(
            `Week ${weekPlan.week}: No module found in LMS (expected "Module ${String(weekPlan.week).padStart(2, "0")}")`
          );
          continue;
        }

        const sourceName = sourceMaterial.split("\n")[0] || "Source Material";
        const pageTitle = `Week ${weekPlan.week} - ${sourceName}: ${weekPlan.chapterRef}`;
        const pageBody = `Complete the ${weekPlan.chapterRef} material from ${sourceName}.${
          sourceUrl
            ? `\n\nAccess the material here: [${sourceName}](${sourceUrl})`
            : ""
        }`;

        // Create page (idempotency: skip when a page with this exact title
        // already exists in the course, so re-runs never duplicate it).
        const normalizedPageTitle = pageTitle.trim().toLowerCase();
        if (existingPageTitles.has(normalizedPageTitle)) {
          summaryItems.push(
            `Week ${weekPlan.week}: Page "${pageTitle}" skipped (already present)`
          );
        } else {
          try {
            const pageResult = await createPageAction(
              canvasUrl,
              { title: pageTitle, body: pageBody, published: true }
            );

            if (!("error" in pageResult)) {
              pagesCreated += 1;
              existingPageTitles.add(normalizedPageTitle);
              summaryItems.push(
                `Week ${weekPlan.week}: Created page "${pageTitle}"`
              );
            } else {
              summaryItems.push(
                `Week ${weekPlan.week}: Could not create page (${pageResult.error})`
              );
            }
          } catch (err) {
            summaryItems.push(
              `Week ${weekPlan.week}: Error creating page (${err})`
            );
          }
        }

        // Create assignment (idempotency: skip when an assignment with this
        // exact title already exists in the course).
        const assignmentTitle = `Complete ${weekPlan.chapterRef} exercises`;
        const normalizedAssignmentTitle = assignmentTitle.trim().toLowerCase();
        if (existingAssignmentTitles.has(normalizedAssignmentTitle)) {
          summaryItems.push(
            `Week ${weekPlan.week}: Assignment "${assignmentTitle}" skipped (already present)`
          );
        } else {
          try {
            const assignmentResult = await createCourseAssignmentAction(
              canvasUrl,
              {
                name: assignmentTitle,
                description: `Complete and submit all exercises in ${weekPlan.chapterRef} from ${sourceName}.${
                  sourceUrl
                    ? `\n\nAccess the material here: [${sourceName}](${sourceUrl})`
                    : ""
                }`,
                submissionType: "online_url",
                pointsPossible: 10,
                published: true,
                dueAt: "",
              },
              moduleId
            );

            if (!("error" in assignmentResult)) {
              assignmentsCreated += 1;
              existingAssignmentTitles.add(normalizedAssignmentTitle);
              summaryItems.push(
                `Week ${weekPlan.week}: Created assignment "${assignmentTitle}"`
              );
            } else {
              summaryItems.push(
                `Week ${weekPlan.week}: Could not create assignment (${assignmentResult.error})`
              );
            }
          } catch (err) {
            summaryItems.push(
              `Week ${weekPlan.week}: Error creating assignment (${err})`
            );
          }
        }
      }

      return {
        outputs: { pagesCreated, assignmentsCreated },
        summary: {
          kind: "list",
          label: `Created ${pagesCreated} page(s) and ${assignmentsCreated} assignment(s)`,
          items: summaryItems,
        },
      };
    },
  },
];
