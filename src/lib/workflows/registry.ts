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
  setupStudentRepoAction,
  listCourseHubAction,
  createCourseAssignmentAction,
  createRubricAction,
  generateCourseRubricFromZipAction,
  getFinalizedSyllabusAction,
  placeSyllabusInModuleAction,
  createGradableAction,
  createQuizQuestionAction,
  bulkUpdateAction,
} from "@/app/actions";
import type { RepoPermission } from "@/lib/github";
import { buildSlidesPptx } from "@/lib/pptx";
import { buildDocxFromPlainText } from "@/lib/docx";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import type {
  StepInputSpec,
  StepOutputSpec,
  GeneratedCourseFile,
  EnsuredModule,
} from "@/lib/workflows/types";
import { scheduleToCsv } from "@/lib/workflows/types";
import { parseGeneratedRubric } from "@/app/utils/rubric";
import type { RubricCriterionInput } from "@/lib/canvas-modules";
import { buildCommonCartridge } from "@/lib/workflows/common-cartridge";

// "Student" or "Student | github-username" (pipe-separated so commas in
// names like "Last, First" never masquerade as usernames).
function parseRosterLines(text: string): Array<{ student: string; username: string }> {
  return text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((row) => {
      const idx = row.lastIndexOf("|");
      if (idx === -1) return { student: row, username: "" };
      return { student: row.slice(0, idx).trim(), username: row.slice(idx + 1).trim().replace(/^@/, "") };
    });
}

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
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: false,
        help: "Optional - names the zip after this course tile.",
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

      // When a course tile is bound, the downloaded zip and library bundle
      // carry the course's name.
      const hubCourseId = String(values.hubCourse ?? "").trim();
      let baseName = repo
        .split("/")
        .pop()
        ?.replace(/[^a-z0-9]/gi, "_")
        .replace(/_+/g, "_") || "lecture_plans";
      if (hubCourseId) {
        const list = await listCourseHubAction();
        if (!("error" in list)) {
          const tile = list.courses.find((c) => c.id === hubCourseId);
          if (tile?.name?.trim()) {
            baseName =
              tile.name.trim().replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_") ||
              baseName;
          }
        }
      }

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

      // An explicit name wins; otherwise the zip defaults to the course
      // tile's name so both Course Refresh zips share it, with
      // "course_materials" as the last resort.
      let base = String(values.name ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/gi, "_")
        .replace(/_+/g, "_");
      if (!base) {
        const list = await listCourseHubAction();
        if (!("error" in list)) {
          const tile = list.courses.find(
            (c) => c.id === String(values.hubCourse)
          );
          if (tile?.name?.trim()) {
            base = tile.name
              .trim()
              .replace(/[^a-z0-9]/gi, "_")
              .replace(/_+/g, "_");
          }
        }
      }
      if (!base) base = "course_materials";
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

  {
    type: "assign-student-repos",
    name: "Assign students to repos",
    description: "Create one repo per student from a template and invite each student as an outside collaborator - the GitHub Classroom pattern. Existing repos are skipped, so re-running is safe.",
    inputs: [
      {
        key: "org",
        label: "Organization",
        type: "org",
        required: true,
      },
      {
        key: "templateRepo",
        label: "Template repository",
        type: "repo",
        required: true,
      },
      {
        key: "roster",
        label: "Students",
        type: "longtext",
        required: false,
        help: 'One student per line: "Student" or "Student | github-username". The student text names the repo; the username receives the invite.',
      },
      {
        key: "rosterCourse",
        label: "Course tile roster",
        type: "hubCourse",
        required: false,
        help: "Optional - fills the student list from this tile's roster when the Students box is empty.",
      },
      {
        key: "prefix",
        label: "Repo name prefix",
        type: "text",
        required: false,
        help: "Repos become <prefix>-<student>.",
      },
      {
        key: "permission",
        label: "Student access",
        type: "text",
        required: false,
        help: "push (default), pull, or maintain.",
      },
      {
        key: "visibility",
        label: "Visibility",
        type: "text",
        required: false,
        help: "private (default) or public.",
      },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      let rosterText = String(values.roster ?? "").trim();

      if (!rosterText && values.rosterCourse) {
        const courseId = String(values.rosterCourse);
        const list = await listCourseHubAction();
        if ("error" in list) {
          throw new Error(list.error);
        }
        const course = list.courses.find((c) => c.id === courseId);
        rosterText = (course?.roster ?? "").trim();
      }

      const rows = parseRosterLines(rosterText);
      if (rows.length === 0) {
        throw new Error("Enter at least one student (or pick a course tile with a roster).");
      }

      const permRaw = String(values.permission ?? "").trim().toLowerCase();
      const permission = (["push", "pull", "maintain"].includes(permRaw)
        ? permRaw
        : "push") as RepoPermission;

      const isPrivate =
        String(values.visibility ?? "").trim().toLowerCase() !== "public";

      const lines: string[] = [];
      let createdCount = 0;
      let existedCount = 0;
      let failedCount = 0;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        onProgress(
          `Setting up ${i + 1} of ${rows.length}: ${row.student || row.username}`
        );

        const r = await setupStudentRepoAction(
          String(values.org),
          String(values.templateRepo),
          String(values.prefix ?? "").trim(),
          row.student,
          row.username,
          isPrivate,
          permission
        );

        if ("error" in r) {
          lines.push(`${row.student || row.username}: ${r.error}`);
          failedCount++;
        } else {
          const parts: string[] = [r.repo];
          parts.push(r.created);
          if (r.invited) parts.push("invited");
          if (r.inviteError) parts.push(`invite failed: ${r.inviteError}`);
          if (!row.username && r.created !== "failed") parts.push("no username yet");

          lines.push(parts.join(", "));

          if (r.created === "created") createdCount++;
          else if (r.created === "existed") existedCount++;
          else if (r.created === "failed") failedCount++;
        }
      }

      if (failedCount === rows.length) {
        throw new Error(`All ${rows.length} student setups failed.`);
      }

      return {
        outputs: {},
        summary: {
          kind: "list",
          label: `${createdCount} created, ${existedCount} already existed, ${failedCount} failed (of ${rows.length})`,
          items: lines,
        },
      };
    },
  },

  {
    type: "lms-rubric",
    name: "Save rubric to LMS",
    description: "Generate a course-wide grading rubric from the repository's assignments and save it to the LMS course.",
    inputs: [
      {
        key: "course",
        label: "LMS course",
        type: "lmsCourse",
        required: false,
        help: "Optional - leave blank to skip the LMS steps.",
      },
      {
        key: "repo",
        label: "Repository",
        type: "repo",
        required: true,
      },
      {
        key: "title",
        label: "Rubric title",
        type: "text",
        required: false,
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

      onProgress("Downloading repository...");
      const z = await getRepoZipAction(String(values.repo));
      if ("error" in z) {
        throw new Error(z.error);
      }

      onProgress("Generating rubric...");
      const r = await generateCourseRubricFromZipAction(
        z.base64,
        helpers.provider
      );

      if (typeof r !== "string") {
        throw new Error(r.error);
      }

      const rows = parseGeneratedRubric(r);
      if (!rows || rows.length === 0) {
        throw new Error("Could not parse the generated rubric. Try again.");
      }

      const criteria: RubricCriterionInput[] = rows.map((row) => {
        const pointsValue =
          Number(String(row.weight).replace(/[^0-9.]/g, "")) || 10;
        return {
          description: row.area,
          longDescription: [
            row.description,
            ...row.subcategories.map((s) => `${s.label}: ${s.description}`),
          ].join("\n"),
          points: pointsValue,
          ratings: [
            { description: "Full marks", points: pointsValue },
            {
              description: "Partial credit",
              points: Math.round(pointsValue / 2),
            },
            { description: "No marks", points: 0 },
          ],
        };
      });

      const title = String(values.title ?? "").trim() || "Course Rubric";
      onProgress("Saving rubric...");
      const created = await createRubricAction(
        course,
        { title, criteria },
        helpers.activeInstitution || undefined
      );

      if ("error" in created) {
        throw new Error(created.error);
      }

      return {
        outputs: {},
        summary: {
          kind: "text",
          text: `Saved rubric "${title}" (${criteria.length} criteria) to the course.`,
        },
      };
    },
  },

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
        key: "startDate",
        label: "Class start date",
        type: "date",
        required: false,
        help: "Deadlines land at 11:59 PM on the last day of each week; leave blank for no due dates.",
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
      const startRaw = String(values.startDate ?? "").trim();
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

        const descriptionLines = [
          "Submit the URL of your GitHub repository containing this week's deliverable in the text box.",
          `Before you start, read the README for this module in the course codebase${
            sw?.assignmentSlug
              ? ` (folder "${sw.assignmentSlug}")`
              : ""
          }: https://github.com/${repoRef}`,
        ];

        let dueAt = "";
        let dueDateStr = "";
        if (start) {
          const due = new Date(start);
          due.setDate(start.getDate() + m.week * 7 - 1);
          due.setHours(23, 59, 0, 0);
          dueAt = due.toISOString();
          dueDateStr = ` (due ${due.toLocaleDateString()})`;
        }

        onProgress(`Creating "${name}" in ${m.name}...`);
        const created = await createCourseAssignmentAction(
          course,
          {
            name,
            description: descriptionLines.join("\n\n"),
            pointsPossible: null,
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
    type: "blackboard-export",
    name: "Blackboard export (.imscc)",
    description: "Package the generated materials as a Common Cartridge you can import into Blackboard (Import Package). Blackboard imports the folders, files, and instruction pages; it does not create gradebook columns from a plain cartridge.",
    inputs: [
      {
        key: "files",
        label: "Generated files",
        type: "files",
        required: true,
      },
      {
        key: "schedule",
        label: "Course schedule",
        type: "schedule",
        required: true,
      },
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: false,
        help: "Optional - names the export after this course tile.",
      },
      {
        key: "startDate",
        label: "Class start date",
        type: "date",
        required: false,
        help: "Shown on each deliverable page as the end-of-week deadline.",
      },
      {
        key: "name",
        label: "Export name",
        type: "text",
        required: false,
      },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const files = values.files as GeneratedCourseFile[];
      const schedule = values.schedule as ScheduleWeekPlan[];

      let baseName = String(values.name ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/gi, "_")
        .replace(/_+/g, "_");

      if (!baseName) {
        const hubCourseId = String(values.hubCourse ?? "").trim();
        if (hubCourseId) {
          const list = await listCourseHubAction();
          if (!("error" in list)) {
            const tile = list.courses.find((c) => c.id === hubCourseId);
            if (tile?.name?.trim()) {
              baseName = tile.name
                .trim()
                .replace(/[^a-z0-9]/gi, "_")
                .replace(/_+/g, "_");
            }
          }
        }
      }

      if (!baseName) {
        baseName = "course-export";
      }

      const startRaw = String(values.startDate ?? "").trim();
      const start = startRaw ? new Date(`${startRaw}T00:00:00`) : null;

      if (start && Number.isNaN(start.getTime())) {
        throw new Error("Enter the class start date as a valid date.");
      }

      const esc = (s: string): string => {
        return s
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      };

      const weeksMap = new Map<number, GeneratedCourseFile[]>();
      for (const file of files) {
        if (!weeksMap.has(file.weekNumber)) {
          weeksMap.set(file.weekNumber, []);
        }
        weeksMap.get(file.weekNumber)!.push(file);
      }

      const weeks = Array.from(weeksMap.entries())
        .sort(([a], [b]) => a - b)
        .map(([week, weekFiles]) => {
          const sw = schedule.find((w) => w.week === week);
          const title = `Module ${String(week).padStart(2, "0")}${
            sw?.topic ? `: ${sw.topic}` : ""
          }`;

          const sorted = [...weekFiles].sort((a, b) => a.sortOrder - b.sortOrder);
          const cartridgeFiles = sorted.map((f) => ({
            name: f.name,
            blob: f.blob,
          }));

          const pages: Array<{ title: string; html: string }> = [];
          if (sw?.assignmentTitle) {
            let dueText = "";
            if (start) {
              const due = new Date(start);
              due.setDate(start.getDate() + week * 7 - 1);
              due.setHours(23, 59, 0, 0);
              dueText = due.toLocaleString();
            }

            const html = `<h1>${esc(sw.assignmentTitle)}</h1><p>Submit the URL of your GitHub repository containing this week's deliverable.</p>${
              sw.assignmentSlug
                ? `<p>Read the README for this module in the course codebase (folder "${esc(
                    sw.assignmentSlug
                  )}").</p>`
                : ""
            }${dueText ? `<p><strong>Deadline:</strong> ${esc(dueText)}</p>` : ""}`;

            pages.push({
              title: sw.assignmentTitle,
              html,
            });
          }

          return {
            week,
            title,
            files: cartridgeFiles,
            pages,
          };
        });

      onProgress("Building Common Cartridge...");
      const blob = await buildCommonCartridge(
        baseName.replace(/_/g, " "),
        weeks
      );

      onProgress("Downloading .imscc...");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${baseName}.imscc`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (helpers.saveBundle) {
        try {
          await helpers.saveBundle(blob, `${baseName}-blackboard`);
        } catch (err) {
          console.error("Library save failed:", err);
        }
      }

      return {
        outputs: {},
        summary: {
          kind: "text",
          text: `Downloaded ${baseName}.imscc - import it in Blackboard via Course Content > Import Package. Folders, files, and instruction pages import; create graded columns in Blackboard separately.`,
        },
      };
    },
  },

  {
    type: "starter-materials",
    name: "Seed Start Here modules",
    description: "Create a Start Here module in each selected LMS course: the course tile's syllabus, a syllabus-acknowledgement quiz due 3 days after the tile's start date, and optionally a GitHub sign-up assignment.",
    inputs: [
      {
        key: "courses",
        label: "LMS courses",
        type: "lmsCourseList",
        required: true,
      },
      {
        key: "includeGithub",
        label: "Include GitHub Starter?",
        type: "boolean",
        required: false,
        help: "Adds a 1-point text-entry assignment asking students to create a GitHub account and submit their username.",
      },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const urls = String(values.courses ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      if (urls.length === 0) {
        throw new Error("Pick at least one LMS course.");
      }

      const includeGh = String(values.includeGithub ?? "") === "1";

      const hub = await listCourseHubAction();
      if ("error" in hub) {
        throw new Error(hub.error);
      }

      const lookup = new Map<string, (typeof hub.courses)[0]>();
      for (const course of hub.courses) {
        if (course.canvasUrl) {
          const id = parseCanvasCourseId(course.canvasUrl);
          if (id) {
            lookup.set(id, course);
          }
        }
      }

      const lines: string[] = [];
      let failures = 0;

      for (const url of urls) {
        try {
          const inst = helpers.activeInstitution || undefined;
          const id = parseCanvasCourseId(url);
          const tile = id ? lookup.get(id) : undefined;

          onProgress(`Preparing ${tile?.name ?? url}...`);

          const content = await listCourseContentAction(url, inst);
          if ("error" in content) {
            throw new Error(content.error);
          }

          let startModule = content.modules.find(
            (m) => m.name.trim().toLowerCase() === "start here"
          );

          if (!startModule) {
            const made = await createModuleAction(url, "Start Here", 1, inst);
            if ("error" in made) {
              throw new Error(made.error);
            }
            startModule = made.module;
          }

          const startRaw = (tile?.startDate ?? "").trim();
          let dueAt = "";
          let dueNote = "no start date on the tile - no deadline";

          if (startRaw) {
            const start = new Date(`${startRaw}T00:00:00`);
            if (!Number.isNaN(start.getTime())) {
              const due = new Date(start);
              due.setDate(start.getDate() + 3);
              due.setHours(23, 59, 0, 0);
              dueAt = due.toISOString();
              dueNote = `due ${due.toLocaleDateString()}`;
            }
          }

          let syllabusNote = "no syllabus on the tile - skipped";
          if (tile?.syllabusId) {
            const s = await getFinalizedSyllabusAction(tile.syllabusId);
            if ("error" in s) {
              syllabusNote = `syllabus error: ${s.error}`;
            } else {
              const fileName = `${s.syllabus.name || "Syllabus"}.docx`;
              const placed = await placeSyllabusInModuleAction(
                s.syllabus.content,
                url,
                startModule.id,
                fileName,
                undefined,
                inst
              );
              if ("error" in placed) {
                syllabusNote = `syllabus error: ${placed.error}`;
              } else {
                syllabusNote = "syllabus added";
              }
            }
          }

          const quiz = await createGradableAction(
            url,
            "Quiz",
            {
              title: "Syllabus Acknowledgement",
              description: "Confirm you have read and understood the course syllabus.",
              dueAt: dueAt || null,
            },
            inst
          );
          if ("error" in quiz) {
            throw new Error(quiz.error);
          }

          const question = await createQuizQuestionAction(
            url,
            quiz.id,
            {
              name: "Syllabus acknowledgement",
              text: "I read and understand the syllabus.",
              type: "true_false_question",
              points: 1,
              answers: [
                { text: "True", correct: true },
                { text: "False", correct: false },
              ],
            },
            inst
          );
          if ("error" in question) {
            throw new Error(question.error);
          }

          const publish = await bulkUpdateAction(
            url,
            "Quiz",
            [String(quiz.id)],
            { published: true },
            inst
          );
          if ("error" in publish) {
            throw new Error(publish.error);
          }

          const item = await createModuleItemAction(
            url,
            startModule.id,
            {
              type: "Quiz",
              contentId: quiz.id,
              title: "Syllabus Acknowledgement",
            },
            inst
          );
          if ("error" in item) {
            throw new Error(item.error);
          }

          if (includeGh) {
            const ghAssignment = await createCourseAssignmentAction(
              url,
              {
                name: "GitHub Sign Up",
                description:
                  "Sign up for a free account at https://github.com, then submit your GitHub username in the text box.",
                pointsPossible: 1,
                dueAt,
                submissionType: "online_text_entry",
                published: true,
              },
              startModule.id,
              inst
            );
            if ("error" in ghAssignment) {
              throw new Error(ghAssignment.error);
            }
          }

          lines.push(
            `${tile?.name ?? url}: Start Here ready (${syllabusNote}; quiz ${dueNote}${
              includeGh ? "; GitHub Sign Up added" : ""
            })`
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          lines.push(`${url}: ${message}`);
          failures++;
        }
      }

      if (failures === urls.length) {
        throw new Error("Starter materials failed for every course.");
      }

      return {
        outputs: {},
        summary: {
          kind: "list",
          label: `Seeded ${urls.length - failures} course(s)${
            failures ? `, ${failures} failed` : ""
          }`,
          items: lines,
        },
      };
    },
  },
];

export function getStepDefinition(type: string): StepDefinition | undefined {
  return STEP_REGISTRY.find((s) => s.type === type);
}
