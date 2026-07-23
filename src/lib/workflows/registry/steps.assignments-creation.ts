// Client-side step catalog: assignment creation step definitions.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  type ScheduleWeekPlan,
  listCourseHubAction,
  createCourseAssignmentAction,
  generateAssignmentAction,
  draftAssignmentDescriptionAction,
} from "@/app/actions";
import {
  type StepDefinition,
  weekDeadline,
  resolveModuleObjectives,
} from "@/lib/workflows/registry-helpers";
import type { GeneratedCourseFile, EnsuredModule } from "@/lib/workflows/types";

export const assignmentCreationSteps: StepDefinition[] = [
  {
    type: "lms-assignments",
    name: "Create module assignments",
    description: "Create one deliverable assignment per module: students submit their GitHub repository URL as a text entry, with the deadline at the end of each week.",
    inputs: [
      {
        key: "course",
        label: "LMS course",
        type: "lmsCourse",
        required: false,
        help: "Optional - leave blank to skip the LMS steps.",
      },
      {
        key: "modules",
        label: "LMS modules",
        type: "modules",
        required: true,
      },
      {
        key: "schedule",
        label: "Course schedule",
        type: "schedule",
        required: true,
      },
      {
        key: "repo",
        label: "Repository",
        type: "repo",
        required: true,
      },
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: false,
        help: "The tile's start date drives the weekly deadlines.",
      },
      {
        key: "startDate",
        label: "Class start date",
        type: "date",
        required: false,
        help: "Overrides the course tile's start date for deadline calculation.",
      },
      {
        key: "files",
        label: "Generated files",
        type: "files",
        required: false,
        help: "When bound, each module's generated instructions become the assignment description.",
      },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const course = String(values.course ?? "").trim();
      if (!course) {
        return {
          outputs: {},
          summary: { kind: "text", text: "Skipped - no LMS course selected." },
        };
      }

      const modules = values.modules as EnsuredModule[];
      if (modules.length === 0) {
        return {
          outputs: {},
          summary: { kind: "text", text: "Skipped - no LMS course selected." },
        };
      }

      const repoRef = String(values.repo);
      const schedule = values.schedule as ScheduleWeekPlan[];
      const genFiles = Array.isArray(values.files) ? (values.files as GeneratedCourseFile[]) : [];

      // Deadlines key off the course tile's start date; the form field is an
      // override.
      const hubCourseId = String(values.hubCourse ?? "").trim();
      const list = hubCourseId ? await listCourseHubAction() : null;
      const tile =
        list && !("error" in list)
          ? list.courses.find((c) => c.id === hubCourseId)
          : undefined;

      const startRaw =
        String(values.startDate ?? "").trim() ||
        (tile?.startDate ?? "").trim();
      const start = startRaw
        ? new Date(`${startRaw}T00:00:00`)
        : null;

      if (start && Number.isNaN(start.getTime())) {
        throw new Error("Enter the class start date as a valid date.");
      }

      const lines: string[] = [];

      for (const m of modules) {
        const sw = schedule.find((w) => w.week === m.week);
        const name =
          sw?.assignmentTitle ||
          `Week ${String(m.week).padStart(2, "0")} Deliverable`;

        const instructionsFile = genFiles.find(
          (f) => f.weekNumber === m.week && f.role === "instructions" && f.pageText
        );

        let description: string;
        if (instructionsFile?.pageText) {
          description = instructionsFile.pageText;
        } else {
          const descriptionLines = [
            "Submit the URL of your GitHub repository containing this week's deliverable in the text box.",
          ];

          if (repoRef) {
            descriptionLines.push(
              `Before you start, read the README for this module in the course codebase${
                sw?.assignmentSlug
                  ? ` (folder "${sw.assignmentSlug}")`
                  : ""
              }: https://github.com/${repoRef}`
            );
          }

          description = descriptionLines.join("\n\n");
        }

        let dueAt = "";
        let dueDateStr = "";
        if (start) {
          const due = weekDeadline(start, m.week);
          dueAt = due.toISOString();
          dueDateStr = ` (due ${due.toLocaleDateString()})`;
        }

        onProgress(`Creating "${name}" in ${m.name}...`);
        const created = await createCourseAssignmentAction(
          course,
          {
            name,
            description,
            pointsPossible: 100,
            dueAt,
            submissionType: "online_text_entry",
            published: true,
          },
          m.id,
          helpers.activeInstitution || undefined
        );

        if ("error" in created) {
          throw new Error(created.error);
        }

        lines.push(`${name} -> ${m.name}${dueDateStr}`);
      }

      return {
        outputs: {},
        summary: {
          kind: "list",
          label: `Created ${modules.length} assignment(s)`,
          items: lines,
        },
      };
    },
  },

  {
    type: "generate-assignment-brief",
    name: "Generate an assignment",
    description: "Draft a structured assignment (overview, steps, deliverables) from a module's objectives.",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile (optional)",
        type: "hubCourse",
        required: false,
        help: "Scope the workflow to a course tile (or bind one) to auto-fill the objectives from its current module - no need to paste them.",
      },
      { key: "objectives", label: "Module objectives", type: "longtext", required: false, courseDerived: true },
      { key: "context", label: "Context", type: "longtext", required: false, help: "Optional source material." },
      {
        key: "modulesAhead",
        label: "Modules ahead",
        type: "moduleOffset",
        required: false,
        help: "How many modules past the current one to target. 0 or blank = the current module.",
      },
    ],
    outputs: [
      { key: "assignment", label: "Assignment", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const objectives = await resolveModuleObjectives(values, helpers);
      if (!objectives) {
        throw new Error("Provide the module objectives, or scope/bind a course tile to derive them from its current module.");
      }
      const context = String(values.context ?? "");
      onProgress("Generating assignment...");
      const r = await generateAssignmentAction(objectives, context, [], helpers.provider);
      if ("error" in r) throw new Error(r.error);

      const lines: string[] = [];
      lines.push(`# ${r.title}\n`);
      lines.push("## Overview");
      lines.push(r.overview);
      lines.push("");

      if (r.steps && r.steps.length > 0) {
        lines.push("## Steps");
        for (let i = 0; i < r.steps.length; i++) {
          const step = r.steps[i];
          lines.push(`${i + 1}. ${step.stepTitle}`);
          lines.push(`   ${step.description}`);
        }
        lines.push("");
      }

      if (r.tools && r.tools.length > 0) {
        lines.push("## Tools");
        for (const tool of r.tools) {
          lines.push(`- ${tool}`);
        }
        lines.push("");
      }

      if (r.deliverables && r.deliverables.length > 0) {
        lines.push("## Deliverables");
        for (const deliverable of r.deliverables) {
          lines.push(`- ${deliverable}`);
        }
        lines.push("");
      }

      const assignment = lines.join("\n").trim();
      const items = [r.title];

      return {
        outputs: { assignment },
        summary: { kind: "list", label: "Assignment", items },
      };
    },
  },

  {
    type: "draft-assignment-description",
    name: "Draft an assignment description",
    description: "AI-draft an assignment description from its name and some notes, ready to attach when creating the assignment.",
    inputs: [
      { key: "name", label: "Assignment name", type: "text", required: true },
      { key: "notes", label: "Notes", type: "longtext", required: false, help: "Optional - what the assignment should cover." },
    ],
    outputs: [
      { key: "description", label: "Description", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const name = String(values.name ?? "").trim();
      if (!name) throw new Error("Provide the assignment name.");
      const notes = String(values.notes ?? "");
      onProgress("Drafting description...");
      const r = await draftAssignmentDescriptionAction(name, notes, helpers.provider);
      if ("error" in r) throw new Error(r.error);
      return {
        outputs: { description: r.text },
        summary: { kind: "text", text: r.text },
      };
    },
  },
];
