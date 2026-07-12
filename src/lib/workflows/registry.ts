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
  createPageAction,
  listCoursesByTermAction,
  createCourseHubAction,
  updateCourseHubAction,
  setModuleDueDatesAction,
  getPageAction,
  previewFileAction,
  createScheduledAnnouncementAction,
  generateLectureFromMaterialsAction,
  analyzeCourseTechAction,
  previewFinalizedSyllabusAction,
  generateCourseSyllabusAction,
  createFinalizedSyllabusAction,
} from "@/app/actions";
import type { Course, CourseInput } from "@/lib/supabase/courses";
import type { InstitutionField } from "@/lib/institution-fields";
import type { RepoPermission } from "@/lib/github";
import type { CommonResourceItem } from "@/lib/common-resources";
import { buildSlidesPptx } from "@/lib/pptx";
import { buildDocxFromPlainText } from "@/lib/docx";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import type {
  StepInputSpec,
  StepOutputSpec,
  GeneratedCourseFile,
  EnsuredModule,
} from "@/lib/workflows/types";
import { scheduleToCsv, csvToSchedule } from "@/lib/workflows/types";
import { parseGeneratedRubric } from "@/app/utils/rubric";
import type { RubricCriterionInput, DueDateUpdate } from "@/lib/canvas-modules";
import { buildCommonCartridge } from "@/lib/workflows/common-cartridge";
import { planCartridgeModules } from "@/lib/week-numbering";

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

// Client-side equivalent of CoursesTab's courseToInput: course tiles are
// updated by full-input round-trips, so EVERY editable field must ride
// along or the update would blank it.
function courseToInputPayload(c: Course): CourseInput {
  return {
    name: c.name,
    courseCode: c.courseCode,
    term: c.term,
    canvasUrl: c.canvasUrl,
    repos: c.repos,
    githubOrg: c.githubOrg,
    textbook: c.textbook,
    syllabusId: c.syllabusId,
    institution: c.institution,
    integrations: c.integrations,
    roster: c.roster,
    notes: c.notes,
    topics: c.topics,
    csvName: c.csvName,
    csvData: c.csvData,
    startDate: c.startDate,
    description: c.description,
    weeks: c.weeks,
    tests: c.tests,
    lms: c.lms,
    dayTime: c.dayTime,
    customTiles: c.customTiles,
  };
}

// Steps run in the browser, so atob decodes stored base64 docx payloads
// straight into Blobs.
function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

// Parse a tile's Day/Time (e.g. "MW 10:00-11:15", "TTh 2:00 PM") into
// weekday numbers plus the FIRST start time. Day tokens only scan the text
// before the first digit so the M in "PM" never reads as Monday; tokens are
// case-insensitive, ordered longest-first (SU, SA, TH, TU before single
// letters M, T, W, R, F), and "R" is the registrar shorthand for Thursday.
// A time with no AM/PM and an hour of 7 or less is assumed PM - typical class times.
function parseDayTime(
  text: string
): { days: Set<number>; hour: number; minute: number } | null {
  const firstDigit = text.search(/\d/);
  const dayPart = firstDigit === -1 ? text : text.slice(0, firstDigit);
  const dayPartUpper = dayPart.toUpperCase();

  // Longest-first token matching: SU, SA, TH, TU before single letters
  const tokenMap: Record<string, number> = {
    SU: 0,
    SA: 6,
    TH: 4,
    TU: 2,
    M: 1,
    T: 2,
    W: 3,
    R: 4,
    F: 5,
  };

  const days = new Set<number>();
  const tokens = dayPartUpper.split(/[^A-Z]+/).filter(Boolean);
  for (const token of tokens) {
    // Try longest match first within this token
    if (token.length >= 2) {
      const twoChar = token.slice(0, 2);
      if (twoChar in tokenMap) {
        days.add(tokenMap[twoChar]);
        continue;
      }
    }
    // Fall back to single character
    if (token.length >= 1) {
      const oneChar = token[0];
      if (oneChar in tokenMap) {
        days.add(tokenMap[oneChar]);
      }
    }
  }

  if (days.size === 0) return null;

  const timeMatch = text.match(/(\d{1,2})(?::(\d{2}))?\s*([AaPp][Mm])?/);
  if (!timeMatch) return null;

  let hour = Number(timeMatch[1]);
  const minute = timeMatch[2] ? Number(timeMatch[2]) : 0;
  const meridiem = timeMatch[3]?.toLowerCase() ?? "";
  if (meridiem === "pm" && hour < 12) {
    hour += 12;
  } else if (meridiem === "am" && hour === 12) {
    hour = 0;
  } else if (!meridiem && hour <= 7) {
    hour += 12;
  }
  if (hour > 23 || minute > 59) return null;

  return { days, hour, minute };
}

// Calculate the deadline for a given week, anchored on the Monday of the start date's week.
// Deadlines land on the Sunday ending week N (23:59:00.000 local time), matching Assign Due Dates.
function weekDeadline(start: Date, week: number): Date {
  const monday0 = new Date(start);
  const day = monday0.getDay();
  monday0.setDate(monday0.getDate() + (day === 0 ? -6 : 1 - day));
  const due = new Date(monday0);
  due.setDate(monday0.getDate() + week * 7 - 1);
  due.setHours(23, 59, 0, 0);
  return due;
}

// The opaque courseList payload passed from fetch-term-courses to
// create-course-cards; lmsId "" marks a row known only from an uploaded
// export, and canvasUrl follows the app's relative /courses/<id> convention.
export interface TermCoursePreviewRow {
  lmsId: string;
  name: string;
  courseCode: string | null;
  termName: string | null;
  canvasUrl: string;
  note: string;
}

export interface StepRunHelpers {
  activeInstitution: string | null;
  provider: LlmProvider;
  author: string;
  saveBundle: ((blob: Blob, name: string) => Promise<void>) | null;
  saveCourseMaterialFile: ((courseId: string, blob: Blob, fileName: string) => Promise<void>) | null;
  loadCommonResources: (() => Promise<CommonResourceItem[]>) | null;
  getLibraryFile: ((fileId: string) => Promise<{ blob: Blob; name: string; mimeType: string } | null>) | null;
  getInstitutionFields: ((acronym: string) => Promise<InstitutionField[]>) | null;
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
  /**
   * Optional confirmation prompt shown after the step's summary; the runner
   * pauses until the user continues or cancels the workflow.
   */
  requireConfirmation?: string;
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

      if (!description.trim()) {
        throw new Error(
          "Provide a course description (Course Kickoff reads it from the course tile)."
        );
      }

      if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) {
        throw new Error(
          "Provide a valid number of weeks (1-52). Course Kickoff reads it from the course tile."
        );
      }

      if (!Number.isInteger(tests) || tests < 0) {
        throw new Error(
          "Provide a valid number of tests (0 or more). Course Kickoff reads it from the course tile."
        );
      }

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
      {
        key: "includeInstructions",
        label: "Include assignment instructions",
        type: "boolean",
        required: false,
        help: "Adds each week's Instructions document to the materials.",
      },
    ],
    outputs: [
      { key: "files", label: "Generated files", type: "files" },
    ],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      const minutes = Number(values.minutes);

      if (!repo) {
        return {
          outputs: { files: [] },
          summary: {
            kind: "text",
            text: "Skipped - no repository linked; no lecture materials were generated.",
          },
        };
      }

      // Course Refresh pins this off via a literal binding; unbound custom
      // workflows keep instructions.
      const includeInstructions =
        values.includeInstructions === undefined
          ? true
          : String(values.includeInstructions) === "1";

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
          role: "slides",
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
            role: "introduction",
            pageText: plan.moduleIntroduction,
          });
        }

        if (includeInstructions && plan.assignmentInstructions) {
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
            role: "instructions",
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
      let tileLms = "";
      if (hubCourseId) {
        const list = await listCourseHubAction();
        if (!("error" in list)) {
          const tile = list.courses.find((c) => c.id === hubCourseId);
          if (tile?.name?.trim()) {
            baseName =
              tile.name.trim().replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_") ||
              baseName;
          }
          tileLms = (tile?.lms ?? "").trim().toLowerCase();
        }
      }

      // Tile's LMS routes which format the browser downloads; files output
      // and library save are unaffected.
      let downloadSkipped = false;
      if (tileLms !== "blackboard" && tileLms !== "canvas") {
        onProgress("Downloading zip...");
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${baseName}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        downloadSkipped = true;
      }

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
          label: downloadSkipped
            ? `Generated ${files.length} files (zip saved to your library - the ${tileLms} tile downloads a Common Cartridge instead)`
            : `Generated ${files.length} files (zip downloaded)`,
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

      // Exactly N week modules are ensured by exact "Module NN" name match;
      // a "Start Here" (or any other) module never matches, so extra
      // starter modules cannot shift or count toward week numbering.
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
        // Modules are targeted by their own week number (set when they were
        // ensured), never by list position, so unnumbered starter modules
        // like "Start Here" cannot skew file placement.
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

        // Introductions become real LMS Pages instead of uploaded docx
        // files; the docx still ships in the zip artifacts.
        if (file.role === "introduction" && file.pageText) {
          const pageTitle = file.name.replace(/\.[^.]+$/, "");
          onProgress(`Creating page "${pageTitle}" in ${targetModule.name}...`);
          const created = await createPageAction(
            course,
            { title: pageTitle, body: file.pageText },
            helpers.activeInstitution || undefined
          );

          if ("error" in created) {
            throw new Error(created.error);
          }

          const linked = await createModuleItemAction(
            course,
            targetModule.id,
            { type: "Page", pageUrl: created.page.url },
            helpers.activeInstitution || undefined
          );

          if ("error" in linked) {
            throw new Error(linked.error);
          }

          uploadedLines.push(`${file.name} -> ${targetModule.name} (page)`);
          continue;
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
      {
        key: "description",
        label: "Course description",
        type: "longtext",
        required: false,
        help: "Steers the generated topics and summaries.",
      },
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: false,
        help: "Used for the Schedule of Topics fallback when the repository is blank.",
      },
    ],
    outputs: [
      { key: "schedule", label: "Course schedule", type: "schedule" },
      { key: "courseTitle", label: "Course title", type: "text" },
      { key: "weeks", label: "Number of weeks", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      const rawWeeks = String(values.weeks ?? "").trim();
      const weeksOrNull = rawWeeks ? Number(rawWeeks) : null;
      const rawTests = String(values.tests ?? "").trim();
      const testsOrNull = rawTests ? Number(rawTests) : null;

      // Normal path: repo is provided
      if (repo) {
        onProgress("Generating schedule from repository...");
        const r = await generateSchedulePlanFromRepoAction(
          repo,
          weeksOrNull,
          testsOrNull,
          helpers.provider,
          String(values.description ?? "").trim() || undefined
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
      }

      // Fallback path: repo is empty, use hubCourse
      const hubCourseId = String(values.hubCourse ?? "").trim();
      if (!hubCourseId) {
        throw new Error(
          "Provide a repository or select a course tile for the Schedule of Topics fallback."
        );
      }

      onProgress("Loading course tile...");
      const listR = await listCourseHubAction();
      if ("error" in listR) {
        throw new Error(listR.error);
      }

      const tile = listR.courses.find((c) => c.id === hubCourseId);
      if (!tile) {
        throw new Error(
          "The course tile could not be found. Provide a repository instead."
        );
      }

      // Fallback 1: CSV data on the tile
      if (tile.csvData?.trim()) {
        onProgress("Loading schedule from tile...");
        const schedule = csvToSchedule(tile.csvData);
        if (schedule.length > 0) {
          const csv = scheduleToCsv(schedule);
          // Gapped Schedules of Topics keep their real week numbers, so the
          // module count must cover the highest week, not the row count.
          const weeks = Math.max(...schedule.map((w) => w.week));
          return {
            outputs: {
              schedule,
              courseTitle: tile.name || "Course",
              weeks,
            },
            summary: {
              kind: "schedule",
              courseTitle: tile.name || "Course",
              schedule,
              csv,
            },
          };
        }
      }

      // Fallback 2: Generate from topics or description
      if (tile.description?.trim() || tile.topics?.trim()) {
        const descriptionText = [
          tile.description?.trim(),
          tile.topics?.trim()
            ? "Topics, one per line:\n" + tile.topics.trim()
            : "",
        ]
          .filter(Boolean)
          .join("\n\n");

        const tileWeeks =
          typeof tile.weeks === "number" && Number.isFinite(tile.weeks)
            ? tile.weeks
            : null;
        const tileTests =
          typeof tile.tests === "number" &&
          Number.isInteger(tile.tests) &&
          tile.tests >= 0
            ? tile.tests
            : null;

        const weeksForGen = weeksOrNull ?? tileWeeks;

        if (
          weeksForGen === null ||
          !Number.isInteger(weeksForGen) ||
          weeksForGen < 1 ||
          weeksForGen > 52
        ) {
          throw new Error(
            "No repository and no saved Schedule of Topics - set the number of weeks on the tile to generate from topics."
          );
        }

        const testsForGen = testsOrNull ?? tileTests ?? 0;

        onProgress("Generating schedule from topics...");
        const r = await generateSchedulePlanAction(
          descriptionText,
          weeksForGen,
          testsForGen,
          helpers.provider
        );

        if ("error" in r) {
          throw new Error(r.error);
        }

        // There is no repository for slugs to reference, so drop the
        // LLM-generated assignmentSlug values; otherwise downstream steps
        // would emit "read the README in folder ..." for a codebase-less tile.
        const schedule = r.schedule.map((w) => ({
          ...w,
          assignmentSlug: null,
        }));

        const csv = scheduleToCsv(schedule);
        return {
          outputs: {
            schedule,
            courseTitle: r.courseTitle,
            weeks: schedule.length,
          },
          summary: {
            kind: "schedule",
            courseTitle: r.courseTitle,
            schedule,
            csv,
          },
        };
      }

      // Fallback 3: nothing available
      throw new Error(
        "The tile has no repository, no saved Schedule of Topics (CSV), and no topics - link a repository or add a schedule to the tile."
      );
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
    description: "Bundle the generated files into a zip and add it to the course tile's materials list.",
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
      const files = values.files as GeneratedCourseFile[];
      if (files.length === 0) {
        return {
          outputs: {},
          summary: {
            kind: "text",
            text: "Skipped - no generated files to bundle.",
          },
        };
      }

      if (!helpers.saveCourseMaterialFile) {
        throw new Error("Sign in to save course materials.");
      }

      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();

      for (const file of files) {
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
      await helpers.saveCourseMaterialFile(String(values.hubCourse), zipBlob, fileName);

      return {
        outputs: {},
        summary: {
          kind: "text",
          text: `Saved ${fileName} to the course materials.`,
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

      const repo = String(values.repo ?? "").trim();
      if (!repo) {
        return {
          outputs: {},
          summary: {
            kind: "text",
            text: "Skipped - no repository linked; the rubric needs the course codebase.",
          },
        };
      }

      onProgress("Downloading repository...");
      const z = await getRepoZipAction(repo);
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
            description: descriptionLines.join("\n\n"),
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
    // The type id stays "blackboard-export" because saved custom workflows
    // reference it; the step now serves any Common Cartridge LMS.
    type: "blackboard-export",
    name: "LMS export (.imscc)",
    description: "Package the generated materials as a Common Cartridge for the course tile's LMS. Canvas imports it via Settings > Import Course Content > Common Cartridge; Blackboard via Import Package. Modules are numbered 01 through the number of scheduled weeks; every module includes its deliverable assignment with the end-of-week deadline.",
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

      // Resolve the tile once if a hubCourse is bound; used for the skip
      // check, the name default, and the LMS-specific save and summary.
      const hubCourseId = String(values.hubCourse ?? "").trim();
      const list = hubCourseId ? await listCourseHubAction() : null;
      const tile =
        list && !("error" in list)
          ? list.courses.find((c) => c.id === hubCourseId)
          : undefined;
      const tileLms = (tile?.lms ?? "").trim().toLowerCase();

      // Skip if the tile was provided but not found, or it has no LMS set;
      // both Canvas and Blackboard import Common Cartridge natively, so
      // either builds. No hubCourse bound means always build.
      if (hubCourseId) {
        if (!tile || (tileLms !== "blackboard" && tileLms !== "canvas")) {
          return {
            outputs: {},
            summary: {
              kind: "text",
              text: "Skipped - the course tile has no LMS set; the plain zip download covers it.",
            },
          };
        }
      }

      let baseName = String(values.name ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/gi, "_")
        .replace(/_+/g, "_");

      if (!baseName && tile?.name?.trim()) {
        baseName = tile.name
          .trim()
          .replace(/[^a-z0-9]/gi, "_")
          .replace(/_+/g, "_");
      }

      if (!baseName) {
        baseName = "course-export";
      }

      // Deadline text keys off the course tile's start date; the form field
      // is an override.
      const startRaw =
        String(values.startDate ?? "").trim() ||
        (tile?.startDate ?? "").trim();
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

      // Modules are numbered 01 through the number of scheduled weeks; file weeks
      // are already normalized 1-based upstream. Every numbered module ships exactly
      // one deliverable assignment so imports never produce an assignment-less module.
      const modulePlans = planCartridgeModules(schedule, Array.from(weeksMap.keys()));

      const weeks = modulePlans.map((plan) => {
        const weekFiles = weeksMap.get(plan.week) ?? [];
        const sorted = [...weekFiles].sort((a, b) => a.sortOrder - b.sortOrder);

        // Introductions ride as wiki_content HTML pages (Canvas imports
        // them as Pages; Blackboard renders the resulting Document inline
        // when opened); slides and instructions stay plain files.
        const cartridgeFiles: Array<{ name: string; blob: Blob }> = [];
        const pages: Array<{ title: string; html: string }> = [];
        for (const f of sorted) {
          if (f.role === "introduction" && f.pageText) {
            pages.push({
              title: f.name.replace(/\.[^.]+$/, ""),
              html: f.pageText
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line) => `<p>${esc(line)}</p>`)
                .join(""),
            });
          } else {
            cartridgeFiles.push({ name: f.name, blob: f.blob });
          }
        }

        // Deliverables ride the CC assignment extension so the import
        // creates real assignments with rendered instructions.
        let dueText = "";
        if (start) {
          const due = weekDeadline(start, plan.week);
          dueText = due.toLocaleString();
        }

        const html = `<p>Submit the URL of your GitHub repository containing this week's deliverable.</p>${
          plan.assignmentSlug
            ? `<p>Read the README for this module in the course codebase (folder "${esc(
                plan.assignmentSlug
              )}").</p>`
            : ""
        }${dueText ? `<p><strong>Deadline:</strong> ${esc(dueText)}</p>` : ""}`;

        const assignments: Array<{
          title: string;
          html: string;
          points: number;
        }> = [
          {
            title: plan.assignmentTitle,
            html,
            points: 100,
          },
        ];

        return {
          week: plan.week,
          title: plan.title,
          files: cartridgeFiles,
          pages,
          assignments,
        };
      });

      // A "Start Here" starter module rides as week 0, purely additive:
      // buildCommonCartridge titles modules from each week's own title
      // (never array position or a week count), so the extra entry cannot
      // shift Module NN numbering. Both Blackboard and Canvas now import
      // the same single full-course cartridge.
      const starterFiles: Array<{ name: string; blob: Blob }> = [];
      let starterNote = "";
      if (tile?.syllabusId) {
        const s = await getFinalizedSyllabusAction(tile.syllabusId);
        if ("error" in s) {
          starterNote = `; syllabus could not be read (${s.error}) - Start Here contains the acknowledgement only`;
        } else {
          starterFiles.push({
            name: `${s.syllabus.name || "Syllabus"}.docx`,
            blob: base64ToBlob(
              s.syllabus.content,
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            ),
          });
        }
      } else {
        starterNote =
          "; no syllabus on the tile - Start Here contains the acknowledgement only";
      }

      // Cartridges cannot express the live path's true/false quiz without
      // QTI; a 1-point acknowledgement assignment is the import-safe
      // equivalent.
      let acknowledgementHtml = "<p>Read the course syllabus, then submit confirming: I read and understand the syllabus.</p>";
      if (start) {
        const ackDue = new Date(start);
        ackDue.setDate(start.getDate() + 3);
        ackDue.setHours(23, 59, 0, 0);
        acknowledgementHtml += `<p><strong>Deadline:</strong> ${esc(ackDue.toLocaleString())}</p>`;
      }
      const starterAssignments = [
        {
          title: "Syllabus Acknowledgement",
          html: acknowledgementHtml,
          points: 1,
        },
      ];

      weeks.unshift({
        week: 0,
        title: "Start Here",
        files: starterFiles,
        pages: [],
        assignments: starterAssignments,
      });

      const starterSummary = `Start Here included (acknowledgement as an assignment)${starterNote}.`;

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
          await helpers.saveBundle(blob, `${baseName}-${tileLms || "cartridge"}`);
        } catch (err) {
          console.error("Library save failed:", err);
        }
      }

      // The export also lands in the course tile's materials list when a
      // tile is bound; a failure notes on the summary instead of failing
      // the step. No tile bound means no tile save.
      let tileSaveNote = "";
      if (hubCourseId && helpers.saveCourseMaterialFile) {
        onProgress("Saving to the course tile...");
        try {
          await helpers.saveCourseMaterialFile(
            hubCourseId,
            blob,
            `${baseName}.imscc`
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          tileSaveNote = `; saving to the course tile failed: ${msg}`;
        }
      }

      let summaryText: string;
      if (tileLms === "canvas") {
        summaryText = `Downloaded ${baseName}.imscc - import it in Canvas via Settings > Import Course Content > Common Cartridge 1.x Package. Deliverables import as assignments; introductions import as pages; files import into modules.`;
      } else if (tileLms === "blackboard") {
        summaryText = `Downloaded ${baseName}.imscc - import it in Blackboard via Import Course Content; modules arrive inside a course folder. Deliverables import as assignments; introductions import as rendered documents.`;
      } else {
        summaryText = `Downloaded ${baseName}.imscc - import it in Canvas via Settings > Import Course Content > Common Cartridge 1.x Package, or in Blackboard via Course Content > Import Package. Deliverables import as assignments; introductions import as pages.`;
      }

      return {
        outputs: {},
        summary: {
          kind: "text",
          text: `${summaryText} ${starterSummary}${tileSaveNote}`,
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
        return {
          outputs: {},
          summary: { kind: "text", text: "Skipped - no LMS course selected." },
        };
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

      // Common Resources load once per run; library file payloads are
      // cached so multi-course runs download each file only once.
      const commonItems = helpers.loadCommonResources
        ? await helpers.loadCommonResources().catch(() => [])
        : [];
      const libCache = new Map<
        string,
        { blob: Blob; name: string; mimeType: string } | null
      >();

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

          // Tiles without a syllabus try the institution's template first:
          // the generated syllabus is saved to the library, linked back to
          // the tile, and then placed like a pre-existing one.
          let syllabusNote = "no syllabus on the tile - skipped";
          let syllabusId = tile?.syllabusId?.trim() ?? "";
          let generatedFromTemplate = false;
          if (tile && !syllabusId) {
            const instFields =
              tile.institution && helpers.getInstitutionFields
                ? await helpers
                    .getInstitutionFields(tile.institution)
                    .catch(() => [])
                : [];
            const templateId =
              instFields
                .find((f) => f.id === "syllabusTemplate")
                ?.value?.trim() ?? "";
            const instEmail =
              instFields.find((f) => f.id === "email")?.value ?? "";
            const instLmsUrl =
              instFields.find((f) => f.id === "lmsUrl")?.value ?? "";

            if (!templateId) {
              syllabusNote =
                "no syllabus on the tile and no institution syllabus template - skipped";
            } else {
              try {
                onProgress(`Generating syllabus for ${tile.name}...`);
                const g = await generateCourseSyllabusAction(
                  templateId,
                  {
                    courseName: tile.name,
                    courseCode: tile.courseCode ?? "",
                    term: tile.term ?? "",
                    description: tile.description ?? "",
                    dayTime: tile.dayTime ?? "",
                    startDate: tile.startDate ?? "",
                    weeks: tile.weeks != null ? String(tile.weeks) : "",
                    tests: tile.tests != null ? String(tile.tests) : "",
                    textbook: tile.textbook ?? "",
                    email: instEmail,
                    lmsUrl: instLmsUrl,
                    institution: tile.institution ?? "",
                  },
                  helpers.provider
                );
                if ("error" in g) {
                  throw new Error(g.error);
                }

                const generatedFileName = /\.docx$/i.test(g.name)
                  ? g.name
                  : `${g.name}.docx`;
                const saved = await createFinalizedSyllabusAction(
                  g.name,
                  generatedFileName,
                  g.base64,
                  tile.courseCode ?? undefined
                );
                if ("error" in saved) {
                  throw new Error(saved.error);
                }

                syllabusId = saved.syllabus.id;
                syllabusNote = "syllabus generated from the institution template";
                generatedFromTemplate = true;

                try {
                  const linked = await updateCourseHubAction(tile.id, {
                    ...courseToInputPayload(tile),
                    syllabusId: saved.syllabus.id,
                  });
                  if ("error" in linked) {
                    throw new Error(linked.error);
                  }
                } catch (err) {
                  syllabusNote += `; linking the generated syllabus to the tile failed: ${
                    err instanceof Error ? err.message : "unknown error"
                  }`;
                }
              } catch (err) {
                syllabusNote = `syllabus generation failed: ${
                  err instanceof Error ? err.message : "unknown error"
                }`;
              }
            }
          }

          if (syllabusId) {
            const s = await getFinalizedSyllabusAction(syllabusId);
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
                syllabusNote = generatedFromTemplate
                  ? "syllabus generated from the institution template and added"
                  : "syllabus added";
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

          // Common Resources import after the built-ins; a failed item
          // notes on the course's summary line instead of failing the
          // course.
          let commonAdded = 0;
          const notes: string[] = [];
          for (const item of commonItems) {
            onProgress(`Adding "${item.title}" to ${tile?.name ?? url}...`);
            try {
              if (item.type === "page") {
                const created = await createPageAction(
                  url,
                  { title: item.title, body: item.body ?? "" },
                  inst
                );
                if ("error" in created) {
                  throw new Error(created.error);
                }

                const linked = await createModuleItemAction(
                  url,
                  startModule.id,
                  { type: "Page", pageUrl: created.page.url },
                  inst
                );
                if ("error" in linked) {
                  throw new Error(linked.error);
                }

                commonAdded++;
              } else if (item.type === "file" && item.fileId) {
                let payload = libCache.get(item.fileId);
                if (payload === undefined) {
                  payload = helpers.getLibraryFile
                    ? await helpers.getLibraryFile(item.fileId)
                    : null;
                  libCache.set(item.fileId, payload);
                }

                if (!payload) {
                  notes.push(`${item.title}: library file missing - skipped`);
                  continue;
                }

                const sanitizedFileName = payload.name.replace(
                  /[^a-z0-9 ._-]/gi,
                  "_"
                );
                const ticket = await requestFileUploadAction(
                  url,
                  {
                    name: sanitizedFileName,
                    size: payload.blob.size,
                    contentType: payload.mimeType,
                    folderPath: "uploads",
                  },
                  inst
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
                form.append("file", payload.blob, sanitizedFileName);

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

                const linked = await createModuleItemAction(
                  url,
                  startModule.id,
                  { type: "File", contentId: uploaded.id, title: item.title },
                  inst
                );
                if ("error" in linked) {
                  throw new Error(linked.error);
                }

                commonAdded++;
              }
            } catch (err) {
              const message =
                err instanceof Error ? err.message : "Unknown error";
              notes.push(`${item.title}: ${message}`);
            }
          }

          lines.push(
            `${tile?.name ?? url}: Start Here ready (${syllabusNote}; quiz ${dueNote}${
              includeGh ? "; GitHub Sign Up added" : ""
            }${
              commonItems.length
                ? `; ${commonAdded} common resource(s) added`
                : ""
            }${notes.length ? `; ${notes.join("; ")}` : ""})`
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

  {
    type: "load-course-tile",
    name: "Load course tile",
    description: "Read the course tile's linked repository, LMS course, and start date so later steps need no separate inputs. Missing pieces surface as warnings.",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: true,
      },
      {
        key: "confirmMissingRepo",
        label: "Pause when repository is missing",
        type: "boolean",
        required: false,
        help: "Pause with an alert when the tile has no repository so the run can be cancelled.",
      },
      {
        key: "allowMissingRepo",
        label: "Allow a missing repository",
        type: "boolean",
        required: false,
        help: "Proceed without pausing when the tile has no repository - Course Kickoff creates one later.",
      },
    ],
    outputs: [
      { key: "repo", label: "Repository", type: "repo" },
      { key: "course", label: "LMS course", type: "lmsCourse" },
      { key: "startDate", label: "Start date", type: "date" },
      { key: "description", label: "Course description", type: "longtext" },
      { key: "weeks", label: "Number of weeks", type: "number" },
      { key: "tests", label: "Number of tests", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      const hubCourseId = String(values.hubCourse ?? "").trim();

      onProgress("Loading course tile...");
      const listR = await listCourseHubAction();
      if ("error" in listR) {
        throw new Error(listR.error);
      }

      const tile = listR.courses.find((c) => c.id === hubCourseId);
      if (!tile) {
        throw new Error("Choose a course tile.");
      }

      const repo = tile.repos[0]?.repo?.trim() ?? "";
      const course = (tile.canvasUrl ?? "").trim();
      const startDate = (tile.startDate ?? "").trim();
      const lms = (tile.lms ?? "").trim();
      const description = (tile.description ?? "").trim();
      const weeks =
        typeof tile.weeks === "number" && Number.isFinite(tile.weeks)
          ? String(tile.weeks)
          : "";
      const tests =
        typeof tile.tests === "number" && Number.isFinite(tile.tests)
          ? String(tile.tests)
          : "";

      // Missing-repo handling defaults to a hard stop: a repo-less tile must
      // never reach the destructive LMS steps with nothing to rebuild. The two
      // opt-in flags relax that - allowMissingRepo skips the pause entirely
      // (Course Kickoff creates the repo later); confirmMissingRepo pauses only
      // when a schedule fallback can actually succeed.
      let repoLine: string;
      let confirmMessage = "";
      if (repo) {
        repoLine = `Repository: ${repo}${
          tile.repos.length > 1 ? ` (first of ${tile.repos.length} linked)` : ""
        }`;
      } else if (String(values.allowMissingRepo ?? "") === "1") {
        repoLine = "Note: no repository linked yet.";
      } else if (String(values.confirmMissingRepo ?? "") === "1") {
        const csvOk = csvToSchedule(tile.csvData ?? "").length > 0;
        const topicsOk = Boolean(
          (tile.description?.trim() || tile.topics?.trim()) &&
            typeof tile.weeks === "number" &&
            Number.isInteger(tile.weeks) &&
            tile.weeks >= 1 &&
            tile.weeks <= 52
        );
        if (!csvOk && !topicsOk) {
          throw new Error(
            "The course tile has no repository and no usable fallback - link a repository, save a Schedule of Topics (CSV), or add topics plus a week count to the tile."
          );
        }
        repoLine =
          "Alert: no repository linked to the tile - repo-driven steps will fall back to the tile's Schedule of Topics or skip.";
        confirmMessage = csvOk
          ? "This tile has no linked repository. Continue to fall back to the tile's saved Schedule of Topics (CSV) for the schedule, or cancel to link a repository first."
          : "This tile has no linked repository. Continue to fall back to a schedule generated from the tile's topics and description, or cancel to link a repository first.";
      } else {
        throw new Error(
          "The course tile has no repository linked - add one on the Courses tab."
        );
      }

      const items = [
        repoLine,
        course
          ? `LMS course: ${course}`
          : "Warning: no LMS course (Canvas URL) on the tile - the LMS steps will be skipped.",
        startDate
          ? `Start date: ${startDate}`
          : "Warning: no start date on the tile - generated assignments will have no deadlines.",
        lms
          ? `LMS: ${lms}`
          : "Warning: no LMS set on the tile - the plain zip downloads instead of an LMS cartridge.",
        description
          ? `Description: ${description.slice(0, 80)}${
              description.length > 80 ? "..." : ""
            }`
          : "Note: no description on the tile - Course Kickoff cannot generate a schedule without it.",
        weeks
          ? `Weeks: ${weeks}`
          : "Note: no weeks on the tile - Course Kickoff needs it to generate a schedule.",
        tests
          ? `Tests: ${tests}`
          : "Note: no tests count on the tile.",
      ];

      const result: StepRunResult = {
        outputs: { repo, course, startDate, description, weeks, tests },
        summary: {
          kind: "list",
          label: `Loaded "${tile.name}"`,
          items,
        },
      };

      if (confirmMessage) {
        result.requireConfirmation = confirmMessage;
      }

      return result;
    },
  },

  {
    type: "fetch-term-courses",
    name: "Fetch term courses (preview)",
    description:
      "List every LMS course in the given term, optionally enriched by uploaded exports, and pause for review before any cards are created.",
    inputs: [
      {
        key: "institution",
        label: "Institution",
        type: "institution",
        required: true,
      },
      {
        key: "term",
        label: "Term",
        type: "text",
        required: true,
        help: "Matched against the LMS term name, e.g. Fall 2026.",
      },
      {
        key: "exports",
        label: "LMS exports",
        type: "uploads",
        required: false,
        help: "Optional .imscc/zip exports; parsed for extra tile details.",
      },
    ],
    outputs: [{ key: "courses", label: "Course list", type: "courseList" }],
    run: async (values, helpers, onProgress) => {
      const institution = String(values.institution ?? "").trim();
      const term = String(values.term ?? "").trim();

      onProgress("Fetching the term's courses...");
      const r = await listCoursesByTermAction(institution, term);
      if ("error" in r) {
        throw new Error(r.error);
      }
      const rows = r.courses;

      // The uploads value type resolves to a runtime File[] (never a
      // persisted string); an unbound input stays undefined and skips the
      // parsing pass entirely.
      const exportFiles = Array.isArray(values.exports)
        ? (values.exports as File[])
        : [];

      const warnings: string[] = [];
      const noteByLmsId = new Map<string, string>();
      const extraRows: Array<{
        id: string;
        name: string;
        courseCode: string | null;
        termName: string | null;
      }> = [];

      // Manifest titles were XML-escaped on export; undo the entities the
      // cartridge writer emits before matching against LMS names.
      const decodeEntities = (s: string): string =>
        s
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, "&");

      for (const file of exportFiles) {
        try {
          onProgress(`Reading ${file.name}...`);
          const { default: JSZip } = await import("jszip");
          const zip = await JSZip.loadAsync(await file.arrayBuffer());
          const manifest = zip.file("imsmanifest.xml");
          if (!manifest) {
            warnings.push(`${file.name}: no imsmanifest.xml found - skipped`);
            continue;
          }

          const xml = await manifest.async("string");
          const m = xml.match(/<lomimscc:string>([^<]+)<\/lomimscc:string>/);
          const title = m ? decodeEntities(m[1]).trim() : "";
          if (!title) {
            warnings.push(`${file.name}: no course title in manifest - skipped`);
            continue;
          }

          // Loose containment match either direction so "CS 101" pairs with
          // "CS 101 - Intro to Programming" and vice versa.
          const lowered = title.toLowerCase();
          const matched = rows.find((row) => {
            const rowName = row.name.toLowerCase();
            return rowName.includes(lowered) || lowered.includes(rowName);
          });

          if (matched) {
            noteByLmsId.set(matched.id, "export attached");
          } else {
            extraRows.push({
              id: "",
              name: title,
              courseCode: null,
              termName: term,
            });
          }
        } catch (err) {
          // A bad export never fails the preview; it surfaces as a warning.
          warnings.push(
            `${file.name}: ${
              err instanceof Error ? err.message : "could not read the export"
            }`
          );
        }
      }

      const payload: TermCoursePreviewRow[] = [
        ...rows.map((row) => ({
          lmsId: row.id,
          name: row.name,
          courseCode: row.courseCode,
          termName: row.termName,
          canvasUrl: row.id ? `/courses/${row.id}` : "",
          note: noteByLmsId.get(row.id) ?? "",
        })),
        ...extraRows.map((row) => ({
          lmsId: row.id,
          name: row.name,
          courseCode: row.courseCode,
          termName: row.termName,
          canvasUrl: "",
          note: "from export only",
        })),
      ];

      return {
        outputs: { courses: payload },
        summary: {
          kind: "list",
          label: `${payload.length} course(s) ready to import`,
          items: [
            ...payload.map(
              (c) =>
                `${c.name}${c.courseCode ? ` [${c.courseCode}]` : ""}${
                  c.termName ? ` - ${c.termName}` : ""
                }${c.note ? ` (${c.note})` : ""}`
            ),
            ...warnings,
          ],
        },
        requireConfirmation:
          "Create a course card for each of these? Existing cards with the same LMS course are skipped.",
      };
    },
  },

  {
    type: "create-course-cards",
    name: "Create course cards",
    description:
      "Create a course tile for each previewed course; tiles whose LMS course already has a card are skipped.",
    inputs: [
      {
        key: "courses",
        label: "Course list",
        type: "courseList",
        required: true,
      },
      {
        key: "institution",
        label: "Institution",
        type: "institution",
        required: true,
      },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const rows = values.courses as TermCoursePreviewRow[];
      const institution = String(values.institution ?? "").trim();

      onProgress("Loading existing course cards...");
      const hub = await listCourseHubAction();
      if ("error" in hub) {
        throw new Error(hub.error);
      }

      const wanted = String(institution ?? "").trim().toUpperCase();
      const existingIds = new Set(
        hub.courses
          .filter((c) => (c.institution ?? "").trim().toUpperCase() === wanted)
          .map((c) => parseCanvasCourseId(c.canvasUrl ?? ""))
          .filter((id): id is string => Boolean(id))
      );

      const existingNameTerms = new Set(
        hub.courses
          .filter((c) => (c.institution ?? "").trim().toUpperCase() === wanted)
          .map((c) => `${(c.name ?? "").trim().toLowerCase()}||${(c.term ?? "").trim().toLowerCase()}`)
      );

      const lines: string[] = [];
      let created = 0;
      let skipped = 0;
      let failed = 0;

      for (const row of rows) {
        // Fail-forward: one bad row records its error and the loop moves on.
        try {
          const nameKey = `${(row.name ?? "").trim().toLowerCase()}||${(row.termName ?? "").trim().toLowerCase()}`;
          if (row.lmsId ? existingIds.has(row.lmsId) : existingNameTerms.has(nameKey)) {
            lines.push(`${row.name}: already exists`);
            skipped++;
            continue;
          }

          onProgress(`Creating "${row.name}"...`);
          const made = await createCourseHubAction({
            name: row.name,
            courseCode: row.courseCode,
            term: row.termName,
            canvasUrl: row.canvasUrl || null,
            institution,
            lms: row.canvasUrl ? "canvas" : null,
          });

          if ("error" in made) {
            throw new Error(made.error);
          }

          if (row.lmsId) {
            existingIds.add(row.lmsId);
          } else {
            existingNameTerms.add(nameKey);
          }
          lines.push(`${row.name}: created`);
          created++;
        } catch (err) {
          lines.push(
            `${row.name}: ${err instanceof Error ? err.message : "failed"}`
          );
          failed++;
        }
      }

      return {
        outputs: {},
        summary: {
          kind: "list",
          label: `${created} created, ${skipped} skipped${
            failed ? `, ${failed} failed` : ""
          }`,
          items: lines,
        },
      };
    },
  },

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

  {
    type: "prepare-lecture",
    name: "Prepare lecture",
    description:
      "Build a lecture deck from a module's materials, save it to the course tile, and schedule a recap announcement after the next class meeting.",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: true,
      },
      {
        key: "moduleId",
        label: "Module",
        type: "lmsModule",
        required: false,
        help: "Pick from the live LMS connection; without one the step falls back to the tile's topics.",
      },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const hubCourseId = String(values.hubCourse ?? "").trim();
      const list = await listCourseHubAction();
      if ("error" in list) {
        throw new Error(list.error);
      }
      const tile = list.courses.find((c) => c.id === hubCourseId);
      if (!tile) {
        throw new Error("Choose a course tile.");
      }

      const canvasUrl = (tile.canvasUrl ?? "").trim();
      const inst = helpers.activeInstitution || undefined;
      const moduleIdRaw = String(values.moduleId ?? "").trim();

      // Materials cap at ~20000 chars so the deck prompt stays inside the
      // action's own truncation budget; going over surfaces as a note.
      const MATERIALS_CAP = 20000;
      const chunks: string[] = [];
      const notes: string[] = [];
      let total = 0;
      let truncated = false;
      const push = (text: string) => {
        if (!text) return;
        if (total >= MATERIALS_CAP) {
          truncated = true;
          return;
        }
        const slice = text.slice(0, MATERIALS_CAP - total);
        if (slice.length < text.length) truncated = true;
        chunks.push(slice);
        total += slice.length;
      };

      let moduleName = "Upcoming module";
      let materialsSource = "";

      if (canvasUrl && moduleIdRaw) {
        onProgress("Loading module materials...");
        const content = await listCourseContentAction(canvasUrl, inst);
        if ("error" in content) {
          throw new Error(content.error);
        }
        const courseModule = content.modules.find(
          (m) => String(m.id) === moduleIdRaw
        );
        if (!courseModule) {
          throw new Error("Pick a module.");
        }
        moduleName = courseModule.name;
        materialsSource = `Materials read from LMS module "${courseModule.name}"`;

        for (const item of courseModule.items) {
          // Fail-forward per item: unreadable materials become notes.
          try {
            if (item.type === "Page" && item.pageUrl) {
              const p = await getPageAction(canvasUrl, item.pageUrl, inst);
              if ("error" in p) {
                throw new Error(p.error);
              }
              const bodyText = p.page.body
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " ")
                .trim();
              push(`# ${p.page.title}\n${bodyText}\n\n`);
            } else if (item.type === "File" && item.contentId !== null) {
              const f = await previewFileAction(canvasUrl, item.contentId, inst);
              if ("error" in f) {
                throw new Error(f.error);
              }
              if (f.preview.text.trim()) {
                push(`# ${item.title}\n${f.preview.text}\n\n`);
              }
            } else if (
              item.type === "Assignment" ||
              item.type === "Quiz" ||
              item.type === "Discussion"
            ) {
              push(`${item.type}: ${item.title}\n`);
            }
          } catch (err) {
            notes.push(
              `${item.title}: ${
                err instanceof Error ? err.message : "could not read"
              }`
            );
          }
        }
      } else {
        push(
          [tile.topics ?? "", tile.description ?? ""]
            .filter(Boolean)
            .join("\n\n")
        );
        notes.push("no live LMS module - using tile topics/description");
        materialsSource = "Materials from the tile's topics/description";
      }

      if (truncated) {
        notes.push("materials truncated to ~20000 characters");
      }

      onProgress("Generating lecture...");
      const r = await generateLectureFromMaterialsAction(
        tile.name,
        moduleName,
        chunks.join(""),
        helpers.provider
      );
      if ("error" in r) {
        throw new Error(r.error);
      }

      const pptxData = await buildSlidesPptx({
        presentationTitle: r.presentationTitle,
        slides: r.slides,
        subtitle: moduleName,
        author: helpers.author,
      });
      const blob = new Blob([pptxData], {
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      });

      const sanitize = (s: string) =>
        s.trim().replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_");
      const fileName = `${sanitize(tile.name)}_${sanitize(moduleName)}_Lecture.pptx`;

      onProgress(`Downloading ${fileName}...`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (helpers.saveCourseMaterialFile) {
        try {
          await helpers.saveCourseMaterialFile(tile.id, blob, fileName);
        } catch (err) {
          notes.push(
            `saving to the course tile failed: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }

      // Schedule the recap announcement for two hours after the next class
      // meeting; a failure notes on the summary instead of failing the step.
      let announcementLine: string;
      const dayTime = (tile.dayTime ?? "").trim();
      if (!canvasUrl) {
        announcementLine =
          "no LMS course on the tile - announcement not scheduled";
      } else if (!dayTime) {
        announcementLine = "no Day/Time on the tile - announcement not scheduled";
      } else {
        const parsed = parseDayTime(dayTime);
        if (!parsed) {
          announcementLine = `could not parse Day/Time "${dayTime}" - announcement not scheduled`;
        } else {
          const now = new Date();
          const candidate = new Date(now);
          candidate.setHours(parsed.hour, parsed.minute, 0, 0);
          // Scan 8 candidate days (today through next week); accept the first
          // whose class start time is strictly in the future.
          let found = false;
          for (let i = 0; i < 8; i++) {
            if (
              parsed.days.has(candidate.getDay()) &&
              candidate.getTime() > now.getTime()
            ) {
              found = true;
              break;
            }
            candidate.setDate(candidate.getDate() + 1);
          }
          if (!found) {
            announcementLine = `could not find a future class meeting for Day/Time "${dayTime}" within 8 days - announcement not scheduled`;
          } else {
            const postAt = new Date(candidate.getTime() + 2 * 60 * 60 * 1000);
            try {
              onProgress("Scheduling the recap announcement...");
              const ann = await createScheduledAnnouncementAction(
                canvasUrl,
                `Lecture recap: ${moduleName}`,
                r.announcement,
                postAt.toISOString(),
                inst
              );
              if ("error" in ann) {
                throw new Error(ann.error);
              }
              announcementLine = `announcement scheduled for ${postAt.toLocaleString()}`;
            } catch (err) {
              announcementLine = `announcement failed: ${
                err instanceof Error ? err.message : "unknown error"
              }`;
            }
          }
        }
      }

      return {
        outputs: {},
        summary: {
          kind: "list",
          label: `Lecture ready for ${moduleName}`,
          items: [
            `${r.slides.length} slide(s) -> ${fileName}`,
            materialsSource,
            announcementLine,
            ...notes,
          ],
        },
      };
    },
  },

  {
    type: "tech-report",
    name: "New-tech report",
    description:
      "Analyze the selected courses' materials and produce a report of emerging-technology opportunities with integration recommendations.",
    inputs: [
      {
        key: "courses",
        label: "Courses",
        type: "hubCourseList",
        required: true,
      },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const ids = String(values.courses ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const hub = await listCourseHubAction();
      if ("error" in hub) {
        throw new Error(hub.error);
      }

      const payloads: Array<{
        name: string;
        topics: string;
        syllabusText: string;
        textbook: string;
        repoDigest: string;
        modulesSummary: string;
        assignmentsSummary: string;
      }> = [];

      const missing: string[] = [];

      for (const id of ids) {
        const tile = hub.courses.find((c) => c.id === id);
        if (!tile) {
          missing.push(`${id}: not found`);
          continue;
        }

        onProgress(`Gathering ${tile.name}...`);

        // Every enrichment fails forward to "" so a missing syllabus or a
        // dead LMS connection never blocks the analysis.
        let syllabusText = "";
        if (tile.syllabusId?.trim()) {
          try {
            const s = await previewFinalizedSyllabusAction(tile.syllabusId);
            if (!("error" in s)) {
              syllabusText = s.paragraphs.map((p) => p.text).join("\n");
            }
          } catch {
            // Fail-forward to "".
          }
        }

        let modulesSummary = "";
        let assignmentsSummary = "";
        const canvasUrl = (tile.canvasUrl ?? "").trim();
        if (canvasUrl) {
          try {
            const content = await listCourseContentAction(
              canvasUrl,
              helpers.activeInstitution || undefined
            );
            if (!("error" in content)) {
              modulesSummary = content.modules.map((m) => m.name).join("\n");

              const byType = new Map<string, string[]>();
              for (const m of content.modules) {
                for (const item of m.items) {
                  if (!byType.has(item.type)) byType.set(item.type, []);
                  byType.get(item.type)!.push(item.title);
                }
              }
              assignmentsSummary = Array.from(byType.entries())
                .map(([type, titles]) => `${type}: ${titles.join("; ")}`)
                .join("\n");
            }
          } catch {
            // Fail-forward to "".
          }
        }

        payloads.push({
          name: tile.name,
          topics: tile.topics ?? "",
          syllabusText,
          textbook: tile.textbook ?? "",
          repoDigest: tile.repos.map((r) => r.repo).join(", "),
          modulesSummary,
          assignmentsSummary,
        });
      }

      if (payloads.length === 0) {
        throw new Error("None of the selected course tiles exist anymore.");
      }

      onProgress("Analyzing courses...");
      const r = await analyzeCourseTechAction(payloads, helpers.provider);
      if ("error" in r) {
        throw new Error(r.error);
      }

      const combined = r.reports
        .map((rep) => `==== ${rep.name} ====\n\n${rep.report}`)
        .join("\n\n");

      onProgress("Building the report document...");
      const docxData = await buildDocxFromPlainText(
        combined,
        undefined,
        helpers.author
      );
      const blob = new Blob([docxData], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "new_tech_report.docx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      return {
        outputs: {},
        summary: {
          kind: "list",
          label: `Analyzed ${r.reports.length} course(s)`,
          items: [
            ...r.reports.map(
              (rep) =>
                `${rep.name}: ${
                  rep.report.split("\n").find((l) => l.trim())?.trim() ?? ""
                }`
            ),
            "Full report downloaded (new_tech_report.docx)",
            ...missing,
          ],
        },
      };
    },
  },
];

export function getStepDefinition(type: string): StepDefinition | undefined {
  return STEP_REGISTRY.find((s) => s.type === type);
}
