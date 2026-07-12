// Client-side step catalog: step definitions that run workflows.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.

import type { LlmProvider } from "@/lib/llm";
import type { ScheduleWeekPlan } from "@/app/actions";
import {
  generateSchedulePlanAction,
  createRepoFromTemplateAction,
  fillAssignmentReadmesAction,
  getRepoZipAction,
  generateLecturePlansAction,
  listCourseContentAction,
  createModuleAction,
  requestFileUploadAction,
  createModuleItemAction,
  createCopilotTaskAction,
  generateSchedulePlanFromRepoAction,
  setCourseCsvAction,
  deleteModuleAction,
} from "@/app/actions";
import { buildSlidesPptx } from "@/lib/pptx";
import { buildDocxFromPlainText } from "@/lib/docx";
import type {
  StepInputSpec,
  StepOutputSpec,
  GeneratedCourseFile,
  EnsuredModule,
} from "@/lib/workflows/types";
import { scheduleToCsv } from "@/lib/workflows/types";

export interface StepRunHelpers {
  activeInstitution: string | null;
  provider: LlmProvider;
  author: string;
  saveBundle: ((blob: Blob, name: string) => Promise<void>) | null;
  saveCourseZip: ((courseId: string, blob: Blob, fileName: string) => Promise<void>) | null;
}

export type StepRunSummary =
  | {
      kind: "schedule";
      courseTitle: string;
      schedule: ScheduleWeekPlan[];
      csv: string;
    }
  | { kind: "link"; label: string; url: string }
  | { kind: "list"; label: string; items: string[] }
  | { kind: "text"; text: string };

export interface StepRunResult {
  outputs: Record<string, unknown>;
  summary: StepRunSummary;
}

export interface StepDefinition {
  type: string;
  name: string;
  description: string;
  inputs: StepInputSpec[];
  outputs: StepOutputSpec[];
  run: (
    values: Record<string, unknown>,
    helpers: StepRunHelpers,
    onProgress: (text: string) => void
  ) => Promise<StepRunResult>;
}

export const STEP_REGISTRY: StepDefinition[] = [
  {
    type: "generate-schedule",
    name: "Generate course schedule",
    description: "Create a structured course schedule with topics and assignments",
    inputs: [
      {
        key: "description",
        label: "Course description",
        type: "longtext",
        required: true,
      },
      {
        key: "weeks",
        label: "Number of weeks",
        type: "number",
        required: true,
      },
      {
        key: "tests",
        label: "Number of tests",
        type: "number",
        required: true,
      },
    ],
    outputs: [
      { key: "schedule", label: "Course schedule", type: "schedule" },
      { key: "courseTitle", label: "Course title", type: "text" },
      { key: "weeks", label: "Number of weeks", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      const description = String(values.description);
      const weeks = Number(values.weeks);
      const tests = Number(values.tests);

      onProgress("Generating schedule...");
      const r = await generateSchedulePlanAction(
        description,
        weeks,
        tests,
        helpers.provider
      );

      if ("error" in r) {
        throw new Error(r.error);
      }

      const csv = scheduleToCsv(r.schedule);
      return {
        outputs: {
          schedule: r.schedule,
          courseTitle: r.courseTitle,
          weeks: r.schedule.length,
        },
        summary: {
          kind: "schedule",
          courseTitle: r.courseTitle,
          schedule: r.schedule,
          csv,
        },
      };
    },
  },

  {
    type: "repo-from-template",
    name: "Create repo from template",
    description: "Generate a new GitHub repository from a template",
    inputs: [
      {
        key: "templateRepo",
        label: "Template repository",
        type: "repo",
        required: true,
      },
      {
        key: "newRepoName",
        label: "New repository name",
        type: "text",
        required: true,
      },
    ],
    outputs: [{ key: "repo", label: "Repository", type: "repo" }],
    run: async (values, helpers, onProgress) => {
      const templateRepo = String(values.templateRepo);
      const newRepoName = String(values.newRepoName);

      onProgress("Creating repository...");
      const r = await createRepoFromTemplateAction(
        templateRepo,
        newRepoName,
        true,
        true
      );

      if ("error" in r) {
        throw new Error(r.error);
      }

      return {
        outputs: { repo: r.repo.fullName },
        summary: {
          kind: "link",
          label: `Created ${r.repo.fullName}`,
          url: r.repo.htmlUrl,
        },
      };
    },
  },

  {
    type: "fill-readmes",
    name: "Write assignment READMEs",
    description: "Generate assignment instructions and place them in the repository",
    inputs: [
      {
        key: "repo",
        label: "Repository",
        type: "repo",
        required: true,
      },
      {
        key: "schedule",
        label: "Course schedule",
        type: "schedule",
        required: true,
      },
      {
        key: "description",
        label: "Course description",
        type: "longtext",
        required: true,
      },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo);
      const schedule = values.schedule as ScheduleWeekPlan[];
      const description = String(values.description);

      onProgress("Writing assignment READMEs...");
      const r = await fillAssignmentReadmesAction(
        repo,
        schedule,
        description,
        helpers.provider
      );

      if ("error" in r) {
        throw new Error(r.error);
      }

      return {
        outputs: {},
        summary: {
          kind: "list",
          label: `Wrote ${r.written.length} README file(s)`,
          items: r.written,
        },
      };
    },
  },

  {
    type: "lecture-zip",
    name: "Build lecture materials zip",
    description: "Generate presentation slides and lecture notes as a zip file",
    inputs: [
      {
        key: "repo",
        label: "Repository",
        type: "repo",
        required: true,
      },
      {
        key: "minutes",
        label: "Lecture duration (minutes)",
        type: "number",
        required: true,
      },
    ],
    outputs: [
      { key: "files", label: "Generated files", type: "files" },
    ],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo);
      const minutes = Number(values.minutes);

      onProgress("Downloading repository...");
      const z = await getRepoZipAction(repo);
      if ("error" in z) {
        throw new Error(z.error);
      }

      onProgress("Generating lecture plans...");
      const plans = await generateLecturePlansAction(
        z.base64,
        minutes,
        undefined,
        undefined,
        helpers.provider
      );

      if ("error" in plans) {
        throw new Error(plans.error);
      }

      const files: GeneratedCourseFile[] = [];

      onProgress(`Processing ${plans.length} assignments...`);
      for (const plan of plans) {
        const pptxData = await buildSlidesPptx({
          presentationTitle: plan.presentationTitle,
          slides: plan.slides,
          subtitle: plan.label,
          author: helpers.author,
        });

        files.push({
          name: `${plan.label} Slides.pptx`,
          blob: new Blob([pptxData], {
            type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          }),
          mimeType:
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          weekNumber: plan.weekNumber,
          sortOrder: 1,
        });

        if (plan.moduleIntroduction) {
          const docxData = await buildDocxFromPlainText(
            plan.moduleIntroduction,
            plan.introTemplateHeadings,
            helpers.author
          );
          files.push({
            name: `${plan.label} Introduction.docx`,
            blob: new Blob([docxData], {
              type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            }),
            mimeType:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            weekNumber: plan.weekNumber,
            sortOrder: 0,
          });
        }

        if (plan.assignmentInstructions) {
          const docxData = await buildDocxFromPlainText(
            plan.assignmentInstructions,
            plan.instructionsTemplateHeadings,
            helpers.author
          );
          files.push({
            name: `${plan.label} Instructions.docx`,
            blob: new Blob([docxData], {
              type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            }),
            mimeType:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            weekNumber: plan.weekNumber,
            sortOrder: 2,
          });
        }
      }

      onProgress("Assembling zip...");
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();

      for (const file of files) {
        zip.file(file.name, file.blob);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });

      const baseName = repo
        .split("/")
        .pop()
        ?.replace(/[^a-z0-9]/gi, "_")
        .replace(/_+/g, "_") || "lecture_plans";

      onProgress("Downloading zip...");
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${baseName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (helpers.saveBundle) {
        try {
          await helpers.saveBundle(zipBlob, baseName);
        } catch (err) {
          console.error("Library save failed:", err);
        }
      }

      return {
        outputs: { files },
        summary: {
          kind: "list",
          label: `Generated ${files.length} files (zip downloaded)`,
          items: files.map((f) => f.name),
        },
      };
    },
  },

  {
    type: "lms-modules",
    name: "Create LMS modules",
    description: "Ensure LMS course has the required module structure",
    inputs: [
      {
        key: "course",
        label: "LMS course",
        type: "lmsCourse",
        required: false,
        help: "Optional - leave blank to skip the LMS steps.",
      },
      {
        key: "weeks",
        label: "Number of weeks",
        type: "number",
        required: true,
      },
    ],
    outputs: [
      { key: "modules", label: "LMS modules", type: "modules" },
    ],
    run: async (values, helpers, onProgress) => {
      const course = String(values.course ?? "").trim();
      if (!course) {
        return {
          outputs: { modules: [] },
          summary: { kind: "text", text: "Skipped - no LMS course selected." },
        };
      }

      const weeks = Number(values.weeks);

      onProgress("Loading existing modules...");
      const c = await listCourseContentAction(
        course,
        helpers.activeInstitution || undefined
      );

      if ("error" in c) {
        throw new Error(c.error);
      }

      const existing = c.modules;
      const modules: EnsuredModule[] = [];

      for (let week = 1; week <= weeks; week++) {
        const name = `Module ${String(week).padStart(2, "0")}`;
        const found = existing.find(
          (m) => m.name.toLowerCase().trim() === name.toLowerCase().trim()
        );

        if (found) {
          modules.push({
            week,
            id: found.id,
            name: found.name,
          });
        } else {
          onProgress(`Creating ${name}...`);
          const m = await createModuleAction(
            course,
            name,
            week,
            helpers.activeInstitution || undefined
          );

          if ("error" in m) {
            throw new Error(m.error);
          }

          modules.push({
            week,
            id: m.module.id,
            name: m.module.name,
          });
        }
      }

      return {
        outputs: { modules },
        summary: {
          kind: "list",
          label: `Ensured ${modules.length} modules`,
          items: modules.map((m) => m.name),
        },
      };
    },
  },

  {
    type: "lms-populate",
    name: "Add files to LMS modules",
    description: "Upload generated course materials to LMS modules",
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
        key: "files",
        label: "Generated files",
        type: "files",
        required: true,
      },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const course = String(values.course ?? "").trim();
      const modules = values.modules as EnsuredModule[];
      const files = values.files as GeneratedCourseFile[];

      if (!course) {
        return {
          outputs: {},
          summary: { kind: "text", text: "Skipped - no LMS course selected." },
        };
      }

      if (modules.length === 0) {
        return {
          outputs: {},
          summary: { kind: "text", text: "Skipped - no LMS course selected." },
        };
      }

      const uploadedLines: string[] = [];

      // Canvas appends module items in upload sequence, so upload in the
      // order the items should appear: by week, then by in-module position.
      const ordered = [...files].sort(
        (a, b) => a.weekNumber - b.weekNumber || a.sortOrder - b.sortOrder
      );

      for (const file of ordered) {
        const targetWeek = Math.min(
          Math.max(file.weekNumber, 1),
          modules[modules.length - 1]?.week || 1
        );
        const targetModule =
          modules.find((m) => m.week === targetWeek) ||
          modules[modules.length - 1];

        if (!targetModule) {
          throw new Error("No modules available.");
        }

        const sanitizedFileName = file.name.replace(/[^a-z0-9 ._-]/gi, "_");

        onProgress(`Uploading ${file.name} to ${targetModule.name}...`);
        const ticket = await requestFileUploadAction(
          course,
          {
            name: sanitizedFileName,
            size: file.blob.size,
            contentType: file.mimeType,
            folderPath: "uploads",
          },
          helpers.activeInstitution || undefined
        );

        if ("error" in ticket) {
          throw new Error(ticket.error);
        }

        const form = new FormData();
        for (const [k, v] of Object.entries(
          ticket.ticket.uploadParams
        )) {
          form.append(k, v);
        }
        form.append("file", file.blob, sanitizedFileName);

        const up = await fetch(ticket.ticket.uploadUrl, {
          method: "POST",
          body: form,
        });

        if (!up.ok) {
          throw new Error(`Upload to Canvas failed (HTTP ${up.status}).`);
        }

        const uploaded = (await up.json().catch(() => null)) as {
          id?: number;
        } | null;
        if (typeof uploaded?.id !== "number") {
          throw new Error("Canvas did not return the uploaded file id.");
        }

        const item = await createModuleItemAction(
          course,
          targetModule.id,
          {
            type: "File",
            contentId: uploaded.id,
            title: file.name,
          },
          helpers.activeInstitution || undefined
        );

        if ("error" in item) {
          throw new Error(item.error);
        }

        uploadedLines.push(`${file.name} -> ${targetModule.name}`);
      }

      return {
        outputs: {},
        summary: {
          kind: "list",
          label: `Uploaded ${files.length} file(s)`,
          items: uploadedLines,
        },
      };
    },
  },

  {
    type: "agent-edit-repo",
    name: "Kick off repo agent task",
    description: "Open a GitHub Copilot coding-agent task on the repository; Copilot opens a pull request for you to review and merge.",
    inputs: [
      {
        key: "repo",
        label: "Repository",
        type: "repo",
        required: true,
      },
      {
        key: "title",
        label: "Task title",
        type: "text",
        required: true,
      },
      {
        key: "instructions",
        label: "Instructions for the agent",
        type: "longtext",
        required: true,
      },
    ],
    outputs: [
      { key: "repo", label: "Repository", type: "repo" },
    ],
    run: async (values, helpers, onProgress) => {
      onProgress("Creating Copilot task...");
      const r = await createCopilotTaskAction(
        String(values.repo),
        String(values.title),
        String(values.instructions)
      );

      if ("error" in r) {
        throw new Error(r.error);
      }

      return {
        outputs: { repo: values.repo },
        summary: {
          kind: "link",
          label: `Copilot task created (issue #${r.issueNumber})`,
          url: r.issueUrl,
        },
      };
    },
  },

  {
    type: "schedule-from-repo",
    name: "Generate schedule from repo",
    description: "Derive the week-by-week schedule from the repository's actual assignment folders.",
    inputs: [
      {
        key: "repo",
        label: "Repository",
        type: "repo",
        required: true,
      },
      {
        key: "weeks",
        label: "Number of weeks",
        type: "number",
        required: false,
        help: "Leave blank to match the repo's assignments",
      },
      {
        key: "tests",
        label: "Number of tests",
        type: "number",
        required: false,
      },
    ],
    outputs: [
      { key: "schedule", label: "Course schedule", type: "schedule" },
      { key: "courseTitle", label: "Course title", type: "text" },
      { key: "weeks", label: "Number of weeks", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      const rawWeeks = String(values.weeks ?? "").trim();
      const weeksOrNull = rawWeeks ? Number(rawWeeks) : null;
      const rawTests = String(values.tests ?? "").trim();
      const testsOrNull = rawTests ? Number(rawTests) : null;

      onProgress("Generating schedule from repository...");
      const r = await generateSchedulePlanFromRepoAction(
        String(values.repo),
        weeksOrNull,
        testsOrNull,
        helpers.provider
      );

      if ("error" in r) {
        throw new Error(r.error);
      }

      const csv = scheduleToCsv(r.schedule);
      return {
        outputs: {
          schedule: r.schedule,
          courseTitle: r.courseTitle,
          weeks: r.schedule.length,
        },
        summary: {
          kind: "schedule",
          courseTitle: r.courseTitle,
          schedule: r.schedule,
          csv,
        },
      };
    },
  },

  {
    type: "save-csv-to-course",
    name: "Save schedule CSV to course tile",
    description: "Store the generated schedule as the CSV on the selected course tile.",
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
        key: "courseTitle",
        label: "CSV name",
        type: "text",
        required: false,
      },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const csv = scheduleToCsv(values.schedule as ScheduleWeekPlan[]);
      const base = String(values.courseTitle ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .slice(0, 60) || "course-schedule";
      const name = `${base}.csv`;

      onProgress(`Saving ${name}...`);
      const r = await setCourseCsvAction(String(values.hubCourse), name, csv);

      if ("error" in r) {
        throw new Error(r.error);
      }

      return {
        outputs: {},
        summary: {
          kind: "text",
          text: `Saved ${name} to the course tile.`,
        },
      };
    },
  },

  {
    type: "save-zip-to-course",
    name: "Save contents zip to course tile",
    description: "Bundle the generated files into a zip and store it as the course tile's materials.",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: true,
      },
      {
        key: "files",
        label: "Generated files",
        type: "files",
        required: true,
      },
      {
        key: "name",
        label: "Zip name",
        type: "text",
        required: false,
      },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      if (!helpers.saveCourseZip) {
        throw new Error("Sign in to save course materials.");
      }

      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();

      for (const file of values.files as GeneratedCourseFile[]) {
        zip.file(file.name, file.blob);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });

      const base = String(values.name ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/gi, "_")
        .replace(/_+/g, "_") || "course_materials";
      const fileName = `${base}.zip`;

      onProgress(`Saving ${fileName}...`);
      await helpers.saveCourseZip(String(values.hubCourse), zipBlob, fileName);

      return {
        outputs: {},
        summary: {
          kind: "text",
          text: `Saved ${fileName} to the course materials tile.`,
        },
      };
    },
  },

  {
    type: "lms-wipe",
    name: "Wipe LMS modules",
    description: "Deletes every module in the LMS course so it can be rebuilt from fresh contents.",
    inputs: [
      {
        key: "course",
        label: "LMS course",
        type: "lmsCourse",
        required: false,
        help: "Optional - leave blank to skip the LMS steps.",
      },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      // An empty LMS course skips the LMS steps so repo/tile-only runs
      // finish cleanly.
      const course = String(values.course ?? "").trim();
      if (!course) {
        return {
          outputs: {},
          summary: { kind: "text", text: "Skipped - no LMS course selected." },
        };
      }

      onProgress("Loading modules...");
      const c = await listCourseContentAction(
        course,
        helpers.activeInstitution || undefined
      );

      if ("error" in c) {
        throw new Error(c.error);
      }

      for (const m of c.modules) {
        onProgress(`Deleting ${m.name}...`);
        const d = await deleteModuleAction(
          course,
          m.id,
          helpers.activeInstitution || undefined
        );

        if ("error" in d) {
          throw new Error(d.error);
        }
      }

      return {
        outputs: {},
        summary: {
          kind: "text",
          text: `Deleted ${c.modules.length} module(s).`,
        },
      };
    },
  },
];

export function getStepDefinition(type: string): StepDefinition | undefined {
  return STEP_REGISTRY.find((s) => s.type === type);
}
