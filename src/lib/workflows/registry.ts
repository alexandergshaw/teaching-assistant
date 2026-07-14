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
  listAnnouncementsAction,
  draftAnnouncementAction,
  createAnnouncementAction,
  createModuleAction,
  requestFileUploadAction,
  createModuleItemAction,
  createCopilotTaskAction,
  generateSchedulePlanFromRepoAction,
  setCourseCsvAction,
  setCourseRubricAction,
  deleteGradingDraftAction,
  deleteModuleAction,
  setupStudentRepoAction,
  listCourseHubAction,
  createCourseAssignmentAction,
  createRubricAction,
  generateCourseRubricFromZipAction,
  generateCourseScheduleAction,
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
  generateLectureQaAction,
  regenerateAnnouncementAction,
  analyzeCourseTechAction,
  previewFinalizedSyllabusAction,
  generateCourseSyllabusAction,
  createFinalizedSyllabusAction,
  gradeAction,
  gradeRepoAction,
  generateAssignmentAction,
  generateAssignmentRubricAction,
  generateFullCreditChecklistAction,
  listGradingQueueAction,
  postCanvasGradesAction,
  pullSubmissionAction,
  saveGradingDraftAction,
  listPendingGradingDraftsAction,
  getGradingDraftAction,
  markGradingDraftReviewedAction,
  listConversationsAction,
  getConversationAction,
  draftMessageReplyAction,
  replyToConversationAction,
  setConversationStateAction,
  detectMeetingRequestAction,
  getAvailableSlotsAction,
  draftMeetingReplyAction,
  createMeetingAction,
  getInstitutionCountsAction,
  getUnreadCountsAction,
  checkStudentActivityAction,
  importLmsSyllabusAction,
  regenerateSyllabusFieldAction,
  listSyllabusTemplatesAction,
  updateSyllabusTemplateAction,
  deleteSyllabusTemplateAction,
  extractTopicsFromRepoAction,
  setRepoTopicsAction,
  generateModuleIntroAction,
  generateLessonPlanAction,
  generateExamplesAction,
  generateDocumentTextAction,
  findCaseStudyMaterialAction,
  findPracticeProblemsAction,
  researchTopicAction,
  generateSlidesAction,
  generateLectureScriptAction,
  reviseLectureSlidesAction,
  extractPptxSlidesAction,
  synthesizeNarrationAction,
  generateAvatarVideoAction,
  getAvatarVideoStatusAction,
  draftAssignmentDescriptionAction,
  getAssignmentSyncStateAction,
  syncAssignmentFromRepoAction,
  syncAssignmentToRepoAction,
  rememberRubricAction,
  findBankedRubricAction,
  bulkAssociateRubricAction,
  generateModelAnswerAction,
  gradeOneSubmissionAction,
  runSubmissionCodeAction,
  listRunArtifactsAction,
  autoFixOfficeFileAction,
  checkBrokenLinksAction,
  measureKnowledgeGapAction,
  runResearchLoopAction,
  listUnverifiedKnowledgeAction,
  generateCopilotProjectPromptAction,
  listCopilotTasksAction,
  listPullRequestFilesAction,
  reviewPullRequestAction,
  mergePullRequestAction,
  setupTestsWorkflowAction,
  dispatchTestsAction,
  getTestRunStatusAction,
  setBranchProtectionAction,
  listGithubReposAction,
  ingestRepoAction,
  commitFileAction,
  copyFileToCanvasPageAction,
  detectRepoFrontendAction,
} from "@/app/actions";
import type { Course, CourseInput } from "@/lib/supabase/courses";
import type { SlideData } from "@/app/actions";
import type { GradingRun, GradingRunEntry } from "@/lib/grade";
import type { InstitutionField } from "@/lib/institution-fields";
import type { RepoPermission } from "@/lib/github";
import type { CommonResourceItem } from "@/lib/common-resources";
import { buildSlidesPptx } from "@/lib/pptx";
import { buildDocxFromPlainText } from "@/lib/docx";
import { markdownLiteToHtml } from "@/lib/markdown-lite";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import { parseCalendarEmbedded } from "@/lib/embedded/calendar";
import { scaffoldSyllabusFields } from "@/lib/embedded/syllabus";
import { scaffoldCourseSchedule } from "@/lib/embedded/schedule";
import { applyTextRevision } from "@/lib/embedded/revise";
import { scaffoldCourseOutline } from "@/lib/embedded/course";
import { extractDefinitions } from "@/lib/embedded/scaffold";
import { scaffoldQuizQuestions, renderQuizText } from "@/lib/embedded/quiz";
import { generateEmbeddedRubricText } from "@/lib/embedded-grader/rubric";
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
import { parseLmsModuleValue } from "@/lib/workflows/module-value";
import type { CartridgeCourseData } from "@/lib/cartridge-import";
import { buildGradingReviewRows, countPostableResults, stripGradingRunEntriesForDraft } from "@/lib/workflows/grading-review-rows";

// Base64-encode UTF-8 text in the browser (btoa alone rejects non-latin1).
function encodeTextBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

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
    rubricName: c.rubricName,
    rubricData: c.rubricData,
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
  saveCourseExportFile: ((courseId: string, blob: Blob, fileName: string) => Promise<void>) | null;
  loadCommonResources: (() => Promise<CommonResourceItem[]>) | null;
  getLibraryFile: ((fileId: string) => Promise<{ blob: Blob; name: string; mimeType: string } | null>) | null;
  getInstitutionFields: ((acronym: string) => Promise<InstitutionField[]>) | null;
  /** Parsed newest LMS export package from the course's export tile, or null
   * when the course has none. */
  loadCourseExport: ((courseId: string) => Promise<CartridgeCourseData | null>) | null;
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

export interface TableRowDetail {
  text: string;
  /** Submitted files (base64) so the pause UI can render text/code content
   * and feed the existing code-run tooling. */
  files?: Array<{ name: string; base64: string; mimeType: string }>;
}

export interface StepRunResult {
  outputs: Record<string, unknown>;
  summary: StepRunSummary;
  /**
   * Optional confirmation prompt shown after the step's summary; the runner
   * pauses until the user continues or cancels the workflow.
   */
  requireConfirmation?: string;
  /**
   * Optional mid-run input request shown after the step's summary. The runner
   * pauses and collects a value, merging it into this step's outputs under
   * `key` before dependent steps run:
   * - "text": a textarea; resolves to the entered string.
   * - "choice": one of `options`; resolves to the chosen value.
   * - "upload": a file picker; resolves to the File[] (runtime-only).
   * - "workflow": a picker over the user's workflows; choosing one records a
   *   post-run handoff to that workflow with `handoffPrefill` as its run-form
   *   values (the chosen id is also merged into outputs under `key`).
   * Cancel fails the step and stops the run unless `optional` is true, in
   * which case the run simply continues with no value merged.
   * A step must not set both requireConfirmation and requireInput.
   */
  requireInput?: {
    message: string;
    key: string;
    kind: "text" | "choice" | "upload" | "workflow" | "table";
    options?: Array<{ value: string; label: string }>;
    optional?: boolean;
    handoffPrefill?: Record<string, string>;
    /** kind "text" only: prefill for the textarea (e.g. a generated draft). */
    initialValue?: string;
    /** Label for the submit button (default "Submit"). */
    submitLabel?: string;
    /** kind "text" only: regenerates the draft; the UI replaces the textarea
     * content with the resolved string. Steps run in-browser, so a closure is
     * valid here. */
    regenerate?: () => Promise<string>;
    /** kind "table" only: column definitions; rows render read-only unless a
     * column is editable. Row keys not listed in columns pass through the edit
     * untouched (useful for hidden join keys). Link columns render cell values as
     * external "View" links when non-empty; link columns are never editable. Width
     * is optional in px. */
    columns?: Array<{ key: string; label: string; editable?: boolean; multiline?: boolean; link?: boolean; width?: number }>;
    /** kind "table" only: the rows to review; the resolved value is the edited
     * array in the same shape. */
    rows?: Array<Record<string, string>>;
    /** kind "table" only: render a leading checkbox per row (all checked by
     * default); the resolved value contains only the checked rows. */
    selectable?: boolean;
    /** kind "table" only: fetches an inline detail text for a row (e.g. the
     * student's submission) when the user expands it. Steps run in-browser,
     * so a closure is valid here. */
    rowDetail?: (row: Record<string, string>) => Promise<TableRowDetail>;
    /** Maps the collected value before it is merged into the step's outputs -
     * e.g. selected display rows back to the step's real payload. Steps run
     * in-browser, so a closure is valid here. The workflow-kind handoff always
     * uses the RAW chosen id, not the transformed value. */
    transform?: (value: string | File[] | Array<Record<string, string>>) => unknown;
  };
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

/**
 * Gather the text a lecture-shaped step feeds the model, trying sources in
 * order: the live LMS module (page bodies + file previews + item titles),
 * then on live failure or an export-sourced module pick the course's LMS
 * export tile (item titles + syllabus text), then the tile's own
 * topics/description. Content gathering never hard-fails the step.
 */
async function gatherModuleMaterials(
  tile: Course,
  moduleIdRaw: string,
  helpers: StepRunHelpers,
  onProgress: (text: string) => void
): Promise<{ moduleName: string; materialsText: string; notes: string[]; materialsSource: string }> {
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

  const canvasUrl = (tile.canvasUrl ?? "").trim();
  const inst = helpers.activeInstitution || undefined;
  const picked = parseLmsModuleValue(moduleIdRaw);

  let moduleName = "Upcoming module";
  let materialsSource = "";
  let gathered = false;

  // Pull item titles + syllabus text from the course's newest LMS export.
  const gatherFromExport = async (matchName: string | null): Promise<boolean> => {
    if (!helpers.loadCourseExport || !matchName) return false;
    onProgress("Reading the course export...");
    let data: CartridgeCourseData | null = null;
    try {
      data = await helpers.loadCourseExport(tile.id);
    } catch (err) {
      notes.push(`course export: ${err instanceof Error ? err.message : "could not read"}`);
      return false;
    }
    if (!data || data.modules.length === 0) return false;
    const target =
      data.modules.find((m) => m.name === matchName) ??
      data.modules.find((m) => m.name.toLowerCase() === matchName.toLowerCase());
    if (!target) return false;
    moduleName = target.name;
    for (const item of target.items) {
      push(`${item.type}: ${item.title}\n`);
    }
    if (data.syllabusHtml) {
      const syllabusText = data.syllabusHtml
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (syllabusText) push(`\n# Course syllabus (context)\n${syllabusText}\n`);
    }
    materialsSource = `Materials from the course export module "${target.name}" (item titles + syllabus)`;
    return true;
  };

  if (picked.fromExport) {
    gathered = await gatherFromExport(picked.name);
    if (!gathered) {
      notes.push(`module "${picked.name ?? ""}" not found in the course export`);
    }
  } else if (canvasUrl && picked.liveId) {
    onProgress("Loading module materials...");
    try {
      const content = await listCourseContentAction(canvasUrl, inst);
      if ("error" in content) {
        throw new Error(content.error);
      }
      const courseModule = content.modules.find((m) => String(m.id) === picked.liveId);
      if (!courseModule) {
        throw new Error("the chosen module was not found in the LMS course");
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
      gathered = true;
    } catch (err) {
      // Live LMS failed: fall back to the course export tile by module name.
      const message = err instanceof Error ? err.message : "could not read the LMS course";
      gathered = await gatherFromExport(picked.name);
      if (gathered) {
        notes.push(`live LMS failed (${message}) - used the course export instead`);
      } else {
        notes.push(`live LMS failed (${message}) and the course export had no matching module`);
      }
    }
  }

  if (!gathered) {
    // Reset any partial content so the terminal fallback stands alone.
    chunks.length = 0;
    total = 0;
    push(
      [tile.topics ?? "", tile.description ?? ""]
        .filter(Boolean)
        .join("\n\n")
    );
    notes.push("no live LMS module or export module - using tile topics/description");
    materialsSource = "Materials from the tile's topics/description";
  }

  if (truncated) {
    notes.push("materials truncated to ~20000 characters");
  }

  return { moduleName, materialsText: chunks.join(""), notes, materialsSource };
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
      {
        key: "schedule",
        label: "Course schedule",
        type: "schedule",
        required: false,
        help: "When bound, each deck is titled with its module's topic.",
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

      // When schedule is bound, use each module's topic to title the deck.
      const schedule = (values.schedule as ScheduleWeekPlan[] | undefined) ?? [];
      if (schedule.length > 0) {
        for (const plan of plans) {
          const scheduleEntry = schedule.find((s) => s.week === plan.weekNumber);
          if (scheduleEntry && scheduleEntry.topic.trim()) {
            plan.presentationTitle = scheduleEntry.topic;
          }
        }
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
            pageText: plan.assignmentInstructions,
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

          // The course tile's LMS inherits from the institution's LMS field
          // when unset, matching the Courses tab display.
          if (!tileLms && tile?.institution && helpers.getInstitutionFields) {
            const fields = await helpers
              .getInstitutionFields(tile.institution)
              .catch(() => []);
            tileLms = (fields.find((f) => f.id === "lmsUrl")?.lms ?? "")
              .trim()
              .toLowerCase();
          }
        }
      }

      // Tile's LMS routes which format the browser downloads; files output
      // and library save are unaffected. Headless (server) runs have no
      // `document` to build a download link with, so they always skip the
      // download itself and rely on the library/tile save below.
      let downloadSkipped = false;
      if (typeof document !== "undefined" && tileLms !== "blackboard" && tileLms !== "canvas") {
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
            { title: pageTitle, body: markdownLiteToHtml(file.pageText) },
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

        // Instructions files with pageText ride the module assignment, not uploaded as files.
        // lms-assignments puts the text in the assignment description.
        if (file.role === "instructions" && file.pageText) {
          uploadedLines.push(`${file.name} -> ${targetModule.name} (rides the module assignment)`);
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
    description: "Generate a course-wide grading rubric from the repository's assignments; save it to the LMS course, onto the course tile, and as a document in the LMS export.",
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
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: false,
        help: "Optional - saves the generated rubric onto this course tile.",
      },
    ],
    outputs: [
      { key: "rubricFiles", label: "Rubric files", type: "files" },
    ],
    run: async (values, helpers, onProgress) => {
      const course = String(values.course ?? "").trim();
      const hubCourseId = String(values.hubCourse ?? "").trim();
      const repo = String(values.repo ?? "").trim();

      if (!repo) {
        return {
          outputs: { rubricFiles: [] },
          summary: { kind: "text", text: "Skipped - no repository linked; the rubric needs the course codebase." },
        };
      }

      if (!course && !hubCourseId) {
        return {
          outputs: { rubricFiles: [] },
          summary: { kind: "text", text: "Skipped - no LMS course or course tile to receive the rubric." },
        };
      }

      const title = String(values.title ?? "").trim() || "Course Rubric";

      // Generation is best-effort: a rubric hiccup must never block the LMS
      // export (which now consumes rubricFiles) or the rest of the refresh, so
      // any failure here degrades to an empty rubricFiles.
      const DOCX_MIME =
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      let rubricText: string;
      let rubricFiles: GeneratedCourseFile[];
      let criteria: RubricCriterionInput[];
      try {
        onProgress("Downloading repository...");
        const z = await getRepoZipAction(repo);
        if ("error" in z) throw new Error(z.error);

        onProgress("Generating rubric...");
        const gen = await generateCourseRubricFromZipAction(z.base64, helpers.provider);
        if (typeof gen !== "string") throw new Error(gen.error);
        rubricText = gen;

        const rows = parseGeneratedRubric(rubricText);
        if (!rows || rows.length === 0) {
          throw new Error("Could not parse the generated rubric.");
        }

        criteria = rows.map((row) => {
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
              { description: "Partial credit", points: Math.round(pointsValue / 2) },
              { description: "No marks", points: 0 },
            ],
          };
        });

        const docxData = await buildDocxFromPlainText(rubricText, [], helpers.author);
        rubricFiles = [
          {
            name: "Grading Rubric.docx",
            blob: new Blob([docxData], { type: DOCX_MIME }),
            mimeType: DOCX_MIME,
            weekNumber: 0,
            sortOrder: 0,
            role: "instructions",
          },
        ];
      } catch (err) {
        return {
          outputs: { rubricFiles: [] },
          summary: {
            kind: "text",
            text: `Rubric skipped - ${err instanceof Error ? err.message : "could not generate the rubric."}`,
          },
        };
      }

      const notes: string[] = [];

      if (hubCourseId) {
        try {
          onProgress("Saving rubric to the course tile...");
          const slug =
            title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 60) ||
            "course-rubric";
          const saved = await setCourseRubricAction(hubCourseId, `${slug}.md`, rubricText);
          if ("error" in saved) throw new Error(saved.error);
          notes.push("saved to the course tile");
        } catch (err) {
          notes.push(`tile save failed (${err instanceof Error ? err.message : "unknown error"})`);
        }
      }

      if (course) {
        try {
          onProgress("Saving rubric to the LMS...");
          const created = await createRubricAction(
            course,
            { title, criteria },
            helpers.activeInstitution || undefined
          );
          if ("error" in created) throw new Error(created.error);
          notes.push(`saved to the LMS (${criteria.length} criteria)`);
        } catch (err) {
          notes.push(`LMS save failed (${err instanceof Error ? err.message : "unknown error"})`);
        }
      } else {
        notes.push("no LMS course - LMS save skipped");
      }

      return {
        outputs: { rubricFiles },
        summary: { kind: "text", text: `Rubric "${title}" ${notes.join("; ")}.` },
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
    // The type id stays "blackboard-export" because saved custom workflows
    // reference it; the step now serves any Common Cartridge LMS.
    type: "blackboard-export",
    name: "LMS export (.imscc)",
    description: "Package the generated materials as a Common Cartridge for the course tile's LMS. Canvas imports deliverables as assignments with real due dates; Blackboard imports each deliverable as a gradable test (one essay submission) with the deadline in its instructions. Canvas imports via Settings > Import Course Content > Common Cartridge; Blackboard via Import Package. Modules are numbered 01 through the number of scheduled weeks.",
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
      {
        key: "rubricFiles",
        label: "Rubric files",
        type: "files",
        required: false,
        help: "Optional - rubric documents to include in the Start Here module.",
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
      let tileLms = (tile?.lms ?? "").trim().toLowerCase();

      // The course tile's LMS inherits from the institution's LMS field when unset, matching the Courses tab display.
      if (!tileLms && tile?.institution && helpers.getInstitutionFields) {
        const fields = await helpers.getInstitutionFields(tile.institution).catch(() => []);
        tileLms = (fields.find((f) => f.id === "lmsUrl")?.lms ?? "").trim().toLowerCase();
      }

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

      // Canvas parses zoneless due_at values as UTC, so the timestamp must
      // be the UTC instant (suffix stripped); Canvas renders it back in the
      // course timezone. A local wall-clock string would shift the imported
      // deadline earlier by the exporter's UTC offset.
      const toUtcTimestamp = (d: Date): string =>
        d.toISOString().replace(/\.\d{3}Z$/, "");

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

        // Find and exclude the instructions file if it carries pageText; it becomes
        // the assignment body instead of a module file.
        const instructionsFile = sorted.find(
          (f) => f.role === "instructions" && f.pageText
        );

        // Introductions ship as .docx files in the cartridge (like slides and
        // instructions); the live path (lms-populate) converts intro text to
        // proper HTML via markdown-lite. Exclude instructions files that carry pageText
        // (they ride the assignment). All other files go into cartridgeFiles.
        const cartridgeFiles: Array<{ name: string; blob: Blob }> = [];
        const pages: Array<{ title: string; html: string }> = [];
        for (const f of sorted) {
          if (instructionsFile && f === instructionsFile) {
            continue;
          }
          cartridgeFiles.push({ name: f.name, blob: f.blob });
        }

        // Deliverables ride the CC assignment extension so the import
        // creates real assignments with rendered instructions.
        let dueText = "";
        let dueAt: string | undefined;
        if (start) {
          const due = weekDeadline(start, plan.week);
          dueText = due.toLocaleString();
          dueAt = toUtcTimestamp(due);
        }

        let html: string;
        if (instructionsFile) {
          // Each module's assignment is the generated instructions document itself -
          // a standalone artifact, not duplicated as a module file.
          html = markdownLiteToHtml(instructionsFile.pageText ?? "");
          if (dueText) {
            html += `<p><strong>Deadline:</strong> ${esc(dueText)}</p>`;
          }
        } else {
          html = `<p>Submit the URL of your GitHub repository containing this week's deliverable.</p>${
            plan.assignmentSlug
              ? `<p>Read the README for this module in the course codebase (folder "${esc(
                  plan.assignmentSlug
                )}").</p>`
              : ""
          }${dueText ? `<p><strong>Deadline:</strong> ${esc(dueText)}</p>` : ""}`;
        }

        const assignments: Array<{
          title: string;
          html: string;
          points: number;
          dueAt?: string;
        }> = [
          {
            title: plan.assignmentTitle,
            html,
            points: 100,
            dueAt,
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
      let ackDueAt: string | undefined;
      if (start) {
        const ackDue = new Date(start);
        ackDue.setDate(start.getDate() + 3);
        ackDue.setHours(23, 59, 0, 0);
        acknowledgementHtml += `<p><strong>Deadline:</strong> ${esc(ackDue.toLocaleString())}</p>`;
        ackDueAt = toUtcTimestamp(ackDue);
      }
      const starterAssignments: Array<{
        title: string;
        html: string;
        points: number;
        dueAt?: string;
      }> = [
        {
          title: "Syllabus Acknowledgement",
          html: acknowledgementHtml,
          points: 1,
          dueAt: ackDueAt,
        },
      ];

      const rubricFiles = (values.rubricFiles as GeneratedCourseFile[] | undefined) ?? [];
      for (const rf of rubricFiles) {
        starterFiles.push({ name: rf.name, blob: rf.blob });
      }

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
        weeks,
        { flavor: tileLms === "canvas" ? "canvas" : "cc" }
      );

      // Headless (server) runs have no `document` to build a download link
      // with; the library/tile saves below still carry the file.
      const downloadSkipped = typeof document === "undefined";
      if (!downloadSkipped) {
        onProgress("Downloading .imscc...");
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${baseName}.imscc`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      if (helpers.saveBundle) {
        try {
          await helpers.saveBundle(blob, `${baseName}-${tileLms || "cartridge"}`);
        } catch (err) {
          console.error("Library save failed:", err);
        }
      }

      // The export also lands in the course tile's LMS Exports tile when a
      // tile is bound; a failure notes on the summary instead of failing
      // the step. No tile bound means no tile save.
      let tileSaveNote = "";
      if (hubCourseId && helpers.saveCourseExportFile) {
        onProgress("Saving to the course tile...");
        try {
          await helpers.saveCourseExportFile(
            hubCourseId,
            blob,
            `${baseName}.imscc`
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          tileSaveNote = `; saving to the course tile failed: ${msg}`;
        }
      }

      let lmsSource: "tile" | "institution" | "none" = "none";
      if (tileLms === "canvas" || tileLms === "blackboard") {
        lmsSource = "tile";
      } else if (tile?.institution && helpers.getInstitutionFields) {
        lmsSource = "institution";
      }

      let lmsSourceSuffix = "";
      if (hubCourseId) {
        if (lmsSource === "institution") {
          lmsSourceSuffix = ` (LMS read from the institution's LMS field)`;
        } else if (lmsSource === "tile") {
          lmsSourceSuffix = ` (LMS read from the course tile)`;
        }
      }

      const fileVerb = downloadSkipped ? "Saved" : "Downloaded";
      let summaryText: string;
      if (tileLms === "canvas") {
        summaryText = `Built for Canvas - deliverables import as assignments with due dates; introductions import as module documents (Word files); files import into modules. ${fileVerb} ${baseName}.imscc${lmsSourceSuffix} - import it in Canvas via Settings > Import Course Content > Common Cartridge 1.x Package.`;
      } else if (tileLms === "blackboard") {
        summaryText = `Built for Blackboard - each deliverable imports as a gradable test (one essay submission) with the deadline in its instructions; introductions import as module documents (Word files); files import into modules. ${fileVerb} ${baseName}.imscc${lmsSourceSuffix} - import it in Blackboard via Import Course Content.`;
      } else {
        summaryText = `${fileVerb} ${baseName}.imscc - import it in Canvas via Settings > Import Course Content > Common Cartridge 1.x Package (Canvas imports deliverables as assignments with due dates), or in Blackboard via Course Content > Import Package (Blackboard imports deliverables as gradable tests with deadlines in instructions).`;
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
      "Build a lecture deck from a module's materials, save it to the course tile, and pause for announcement review - edit, regenerate with AI, or approve before it is scheduled.",
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
        help: "Pick from the live LMS connection or the course's LMS export; without either the step falls back to the tile's topics.",
      },
    ],
    outputs: [
      { key: "announcement", label: "Announcement", type: "longtext" },
      { key: "moduleName", label: "Module", type: "text" },
    ],
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

      const moduleIdRaw = String(values.moduleId ?? "").trim();
      const { moduleName, materialsText, notes, materialsSource } =
        await gatherModuleMaterials(tile, moduleIdRaw, helpers, onProgress);

      onProgress("Generating lecture...");
      const r = await generateLectureFromMaterialsAction(
        tile.name,
        moduleName,
        materialsText,
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

      const result: StepRunResult = {
        outputs: {
          announcement: r.announcement,
          moduleName,
        },
        summary: {
          kind: "list",
          label: `Lecture ready for ${moduleName}`,
          items: [
            `${r.slides.length} slide(s) -> ${fileName}`,
            materialsSource,
            ...notes,
          ],
        },
      };

      const materialsForPrompt = materialsText;
      let latestDraft = r.announcement;

      result.requireInput = {
        message: "Review the recap announcement below. Edit it directly, regenerate it with AI, or approve it to schedule; skip to finish without scheduling.",
        key: "announcement",
        kind: "text",
        optional: true,
        initialValue: r.announcement,
        submitLabel: "Approve announcement",
        regenerate: async () => {
          const regen = await regenerateAnnouncementAction(
            tile.name,
            moduleName,
            materialsForPrompt,
            latestDraft,
            helpers.provider
          );
          if ("error" in regen) throw new Error(regen.error);
          latestDraft = regen.announcement;
          return regen.announcement;
        },
      };

      return result;
    },
  },

  {
    type: "schedule-lecture-announcement",
    name: "Schedule lecture announcement",
    description: "Schedule the approved recap announcement for two hours after the next class meeting.",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: true,
      },
      {
        key: "announcement",
        label: "Announcement text",
        type: "longtext",
        required: false,
      },
      {
        key: "moduleName",
        label: "Module name",
        type: "text",
        required: false,
      },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const announcement = String(values.announcement ?? "").trim();

      if (!announcement) {
        return {
          outputs: {},
          summary: {
            kind: "text",
            text: "Skipped - announcement not approved.",
          },
        };
      }

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
      const moduleName = String(values.moduleName ?? "").trim() || "Upcoming module";
      const dayTime = (tile.dayTime ?? "").trim();

      let summaryLine: string;

      if (!canvasUrl) {
        summaryLine = "no LMS course on the tile - announcement skipped";
      } else if (!dayTime) {
        summaryLine = "no Day/Time on the tile - announcement not scheduled";
      } else {
        const parsed = parseDayTime(dayTime);
        if (!parsed) {
          summaryLine = `could not parse Day/Time "${dayTime}" - announcement not scheduled`;
        } else {
          const now = new Date();
          const candidate = new Date(now);
          candidate.setHours(parsed.hour, parsed.minute, 0, 0);
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
            summaryLine = `could not find a future class meeting for Day/Time "${dayTime}" within 8 days - announcement not scheduled`;
          } else {
            const postAt = new Date(candidate.getTime() + 2 * 60 * 60 * 1000);
            try {
              onProgress("Scheduling the recap announcement...");
              const ann = await createScheduledAnnouncementAction(
                canvasUrl,
                `Lecture recap: ${moduleName}`,
                announcement,
                postAt.toISOString(),
                inst
              );
              if ("error" in ann) {
                throw new Error(ann.error);
              }
              summaryLine = `announcement scheduled for ${postAt.toLocaleString()}`;
            } catch (err) {
              summaryLine = `announcement failed: ${
                err instanceof Error ? err.message : "unknown error"
              }`;
            }
          }
        }
      }

      return {
        outputs: {},
        summary: {
          kind: "text",
          text: summaryLine,
        },
      };
    },
  },

  {
    type: "lecture-qa",
    name: "Anticipate lecture Q&A",
    description:
      "Predict the questions students are likely to ask during a lecture and draft instructor-ready answers from the module's materials and optional slide deck.",
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
        help: "Pick from the live LMS connection or the course's LMS export; without either the step falls back to the tile's topics.",
      },
      {
        key: "slides",
        label: "Lecture slides (optional)",
        type: "uploads",
        required: false,
        help: "Attach the lecture deck (.pptx, .pdf, or .docx, up to 3 files of ~6 MB each) to ground the questions in what will actually be presented.",
        accept: ".pptx,.pdf,.docx,.ppt,.doc",
      },
    ],
    outputs: [
      { key: "qaText", label: "Q&A", type: "longtext" },
      { key: "moduleName", label: "Module", type: "text" },
    ],
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

      const moduleIdRaw = String(values.moduleId ?? "").trim();
      const { moduleName, materialsText, notes, materialsSource } =
        await gatherModuleMaterials(tile, moduleIdRaw, helpers, onProgress);

      // Optional slide uploads ride to the server as base64 for text
      // extraction. Server actions cap request bodies at 10 MB, so oversized
      // or extra files are skipped with a note instead of failing the run.
      const uploads = Array.isArray(values.slides) ? (values.slides as File[]) : [];
      const MAX_SLIDE_FILES = 3;
      const MAX_SLIDE_BYTES = 6 * 1024 * 1024;
      if (uploads.length > MAX_SLIDE_FILES) {
        notes.push(
          `only the first ${MAX_SLIDE_FILES} slide files are used (${uploads.length} attached)`
        );
      }
      const slideFiles: Array<{ name: string; base64: string }> = [];
      for (const file of uploads.slice(0, MAX_SLIDE_FILES)) {
        if (file.size > MAX_SLIDE_BYTES) {
          notes.push(`${file.name}: too large (max ~6 MB) - skipped`);
          continue;
        }
        try {
          const buffer = await file.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = "";
          const CHUNK = 0x8000;
          for (let i = 0; i < bytes.length; i += CHUNK) {
            binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
          }
          slideFiles.push({ name: file.name, base64: btoa(binary) });
        } catch (err) {
          notes.push(
            `${file.name}: ${err instanceof Error ? err.message : "could not read"}`
          );
        }
      }

      onProgress("Anticipating student questions...");
      const r = await generateLectureQaAction(
        tile.name,
        moduleName,
        materialsText,
        slideFiles,
        helpers.provider
      );
      if ("error" in r) {
        throw new Error(r.error);
      }
      if (r.questions.length === 0) {
        throw new Error("The model returned no questions. Try again.");
      }

      const qaText = r.questions
        .map((q, i) => `Q${i + 1}: ${q.question}\n\nA: ${q.answer}`)
        .join("\n\n\n");

      // Markdown headings make the docx structure deterministic (the plain-text
      // builder's heading heuristics depend on line length otherwise).
      const docText = [
        `# ${tile.name} - ${moduleName}: Anticipated student questions`,
        "",
        ...r.questions.flatMap((q, i) => [`## Q${i + 1}: ${q.question}`, "", q.answer, ""]),
      ].join("\n");
      const docxBuffer = await buildDocxFromPlainText(docText, [], helpers.author);
      const blob = new Blob([new Uint8Array(docxBuffer)], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });

      const sanitize = (s: string) =>
        s.trim().replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_");
      const fileName = `${sanitize(tile.name)}_${sanitize(moduleName)}_QA.docx`;

      // Headless (server) runs have no `document` to build a download link
      // with; the course-tile save below still carries the file.
      if (typeof document !== "undefined") {
        onProgress(`Downloading ${fileName}...`);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

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

      return {
        outputs: { qaText, moduleName },
        summary: {
          kind: "list",
          label: `${r.questions.length} anticipated question(s) for ${moduleName} -> ${fileName}`,
          items: [
            ...r.questions.map((q) => q.question),
            materialsSource,
            ...(slideFiles.length > 0
              ? [`slides included: ${slideFiles.map((f) => f.name).join(", ")}`]
              : []),
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
      {
        key: "collectImprovements",
        label: "Ask for improvements",
        type: "boolean",
        required: false,
        help: "Pause after the report to collect improvement instructions for the Copilot step.",
      },
    ],
    outputs: [
      { key: "report", label: "Report text", type: "longtext" },
      { key: "improvements", label: "Improvements", type: "longtext" },
    ],
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
        .map((rep) => `# ${rep.name}\n${rep.report}`)
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

      const result: StepRunResult = {
        outputs: { report: combined, improvements: "" },
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

      if (String(values.collectImprovements ?? "") === "1") {
        result.requireInput = {
          message:
            "Review the report, then list the improvements the Copilot agent should make to the course repositories - one per line.",
          key: "improvements",
          kind: "text",
        };
      }

      return result;
    },
  },

  {
    type: "agent-improve-repos",
    name: "Improve repos via Copilot agent",
    description:
      "Fire a GitHub Copilot agent task on each course's linked repository with the listed improvements; courses without a repository can hand off to another workflow.",
    inputs: [
      {
        key: "courses",
        label: "Courses",
        type: "hubCourseList",
        required: true,
      },
      {
        key: "improvements",
        label: "Improvements",
        type: "longtext",
        required: true,
        help: "One improvement per line.",
      },
      {
        key: "report",
        label: "Report context",
        type: "longtext",
        required: false,
        help: "Optional context appended to the agent instructions.",
      },
    ],
    outputs: [{ key: "workflowChoice", label: "Follow-up workflow", type: "text" }],
    run: async (values, helpers, onProgress) => {
      const improvements = String(values.improvements ?? "").trim();
      if (!improvements) {
        return {
          outputs: { workflowChoice: "" },
          summary: { kind: "text", text: "Skipped - no improvements provided." },
        };
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
      const noRepo: Array<{ id: string; name: string }> = [];
      let taskCount = 0;

      for (const id of ids) {
        try {
          const tile = hub.courses.find((c) => c.id === id);
          if (!tile) {
            lines.push(`${id}: not found`);
            continue;
          }

          const repo = (tile.repos[0]?.repo ?? "").trim();
          if (!repo) {
            noRepo.push({ id: tile.id, name: tile.name });
            lines.push(`${tile.name}: no repository on the tile`);
            continue;
          }

          const reportContext = String(values.report ?? "").trim();
          const body =
            improvements +
            (reportContext
              ? `\n\nContext from the technology report:\n${reportContext.slice(0, 4000)}`
              : "");

          onProgress(`Firing Copilot task for ${tile.name}...`);
          const r = await createCopilotTaskAction(
            repo,
            "Course technology improvements",
            body
          );

          if ("error" in r) {
            lines.push(`${tile.name}: ${r.error}`);
          } else {
            taskCount++;
            lines.push(`${tile.name}: Copilot task #${r.issueNumber}`);
          }
        } catch (err) {
          lines.push(
            `${hub.courses.find((c) => c.id === id)?.name ?? id}: ${
              err instanceof Error ? err.message : "failed"
            }`
          );
        }
      }

      const result: StepRunResult = {
        outputs: { workflowChoice: "" },
        summary: {
          kind: "list",
          label: `Fired ${taskCount} Copilot task(s)`,
          items: lines,
        },
      };

      if (noRepo.length > 0) {
        const noRepoNames = noRepo.map((t) => t.name).join(", ");
        result.requireInput = {
          message: `${noRepoNames} ${
            noRepo.length === 1 ? "has" : "have"
          } no linked repository. Choose a workflow to run for ${
            noRepo.length === 1 ? "it" : "them"
          } next, or skip to finish.`,
          key: "workflowChoice",
          kind: "workflow",
          optional: true,
          handoffPrefill: {
            hubCourse: noRepo[0].id,
            courses: noRepo.map((t) => t.id).join("\n"),
          },
        };
      }

      return result;
    },
  },

  {
    type: "grading-preflight",
    name: "Find work needing grading",
    description:
      "List the selected courses' assignments with ungraded submissions and their rubric status.",
    inputs: [
      {
        key: "courses",
        label: "Courses",
        type: "hubCourseList",
        required: false,
        help: "Leave empty and pick an institution instead to grade every course with pending submissions.",
      },
      {
        key: "institution",
        label: "Institution",
        type: "institution",
        required: false,
        help: "Used when no course tiles are selected: every course at this institution with assignments awaiting grading is included.",
      },
    ],
    outputs: [{ key: "plan", label: "Grading plan", type: "courseList" }],
    run: async (values, helpers, onProgress) => {
      const ids = String(values.courses ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const hub = await listCourseHubAction();
      if ("error" in hub) {
        throw new Error(hub.error);
      }

      const lines: string[] = [];

      interface PlanRow {
        courseId: string;
        courseName: string;
        institution?: string;
        canvasUrl?: string;
        assignmentName?: string;
        assignmentId?: string;
        needsGrading?: number;
        hasRubric?: boolean;
        rubricText?: string;
        description?: string;
        pointsPossible?: number | null;
        offline?: boolean;
      }

      const plan: PlanRow[] = [];
      const queueErrors: Array<{ acronym: string; error: string }> = [];
      let offline: Course[] = [];

      // Institution-wide mode: no tiles selected
      if (ids.length === 0) {
        const acronym = String(values.institution ?? "").trim().toUpperCase();
        if (!acronym) {
          throw new Error("Select one or more course tiles, or pick an institution.");
        }

        onProgress("Loading grading queue...");
        const queueResult = await listGradingQueueAction([acronym]);
        if ("error" in queueResult) {
          throw new Error(queueResult.error);
        }

        const { rows: queueRows, errors } = queueResult;
        queueErrors.push(...errors);
        for (const e of errors) {
          lines.push(`Institution ${e.acronym}: ${e.error}`);
        }

        // Build plan from ALL returned rows (no tile matching)
        for (const row of queueRows) {
          const hasRubric = !!(row.rubricText && row.rubricText.trim());
          plan.push({
            courseId: "", // no local tile
            courseName: row.courseName || row.canvasUrl,
            institution: row.institution,
            canvasUrl: row.canvasUrl,
            assignmentName: row.title,
            assignmentId: row.assignmentId,
            needsGrading: row.needsGradingCount,
            hasRubric,
            rubricText: row.rubricText ?? "",
            description: row.description ?? "",
            pointsPossible: row.pointsPossible,
          });

          lines.push(
            `${row.courseName || row.canvasUrl} - ${row.title}: ${row.needsGradingCount} to grade${
              hasRubric ? "" : " (no rubric)"
            }`
          );
        }

        if (plan.length === 0 && queueErrors.length > 0) {
          throw new Error(
            `The grading queue could not be loaded for ${acronym}: ${queueErrors
              .map((e) => e.error)
              .join("; ")}`
          );
        }

        if (lines.length === 0) {
          lines.push(`Nothing needs grading at ${acronym}.`);
        }
      } else {
        // Tile-based mode: existing logic
        // Fail-forward: a deleted tile records a line and drops out of the plan.
        const tiles: Course[] = [];
        for (const id of ids) {
          const tile = hub.courses.find((c) => c.id === id);
          if (!tile) {
            lines.push(`${id}: not found`);
            continue;
          }
          tiles.push(tile);
        }

        const withLms = tiles.filter((t) => (t.canvasUrl ?? "").trim());
        // Assign the OUTER offline list (declared above both modes): the
        // no-rubric confirmation below counts offline tiles from it.
        offline = tiles.filter((t) => !(t.canvasUrl ?? "").trim());

        // Uppercase before dedup: listGradingQueueAction uppercases acronyms, so
        // "ut" and "UT" are the same institution and must scan once, not twice.
        const resolveAcronym = (t: Course): string =>
          (t.institution || helpers.activeInstitution || "").trim().toUpperCase();
        const acronyms = [...new Set(withLms.map(resolveAcronym).filter(Boolean))];

        if (withLms.length > 0) {
          onProgress("Loading grading queue...");
          const queueResult = await listGradingQueueAction(acronyms);
          if ("error" in queueResult) {
            throw new Error(queueResult.error);
          }

          const { rows: queueRows, errors } = queueResult;
          // An expired token must surface, never read as "nothing needs grading".
          queueErrors.push(...errors);
          for (const e of errors) {
            lines.push(`Institution ${e.acronym}: ${e.error}`);
          }

          for (const tile of withLms) {
            const tileCanvasId = parseCanvasCourseId(tile.canvasUrl ?? "");
            if (!tileCanvasId) {
              lines.push(`${tile.name}: the LMS URL has no /courses/<id> - skipped`);
              continue;
            }

            // Match on institution + numeric course id: ids alone collide
            // across institutions and would duplicate rows.
            const tileAcronym = resolveAcronym(tile);
            const tileRows = queueRows.filter((row) => {
              const rowCanvasId = parseCanvasCourseId(row.canvasUrl);
              return (
                rowCanvasId === tileCanvasId &&
                row.institution.trim().toUpperCase() === tileAcronym
              );
            });

            for (const row of tileRows) {
              const hasRubric = !!(row.rubricText && row.rubricText.trim());
              plan.push({
                courseId: tile.id,
                courseName: tile.name,
                institution: row.institution,
                canvasUrl: row.canvasUrl,
                assignmentName: row.title,
                assignmentId: row.assignmentId,
                needsGrading: row.needsGradingCount,
                hasRubric,
                rubricText: row.rubricText ?? "",
                description: row.description ?? "",
                pointsPossible: row.pointsPossible,
              });

              lines.push(
                `${tile.name} - ${row.title}: ${row.needsGradingCount} to grade${
                  hasRubric ? "" : " (no rubric)"
                }`
              );
            }
          }
        }

        for (const tile of offline) {
          plan.push({ courseId: tile.id, courseName: tile.name, offline: true });
          lines.push(`${tile.name}: no LMS - submissions can be uploaded as a zip in the next step`);
        }

        if (plan.length === 0 && queueErrors.length > 0) {
          throw new Error(
            `The grading queue could not be loaded for ${queueErrors
              .map((e) => e.acronym)
              .join(", ")}: ${queueErrors.map((e) => e.error).join("; ")}`
          );
        }

        if (lines.length === 0) {
          lines.push("Nothing needs grading in the selected courses.");
        }
      }

      const result: StepRunResult = {
        outputs: { plan },
        summary: { kind: "list", label: "Grading queue", items: lines },
      };

      // Build display rows from LMS plan rows only (skip offline rows).
      const displayRows: Array<Record<string, string>> = [];
      for (let idx = 0; idx < plan.length; idx++) {
        const p = plan[idx];
        if (!p.offline) {
          displayRows.push({
            planIndex: String(idx),
            course: p.courseName,
            assignment: p.assignmentName ?? "",
            toGrade: String(p.needsGrading ?? 0),
            rubric: p.hasRubric ? "yes" : "generated at grading",
          });
        }
      }

      // When there are LMS rows, use selectable table; otherwise check for offline rows with missing rubrics.
      if (displayRows.length > 0) {
        const noRubricLmsCount = displayRows.filter(
          (r) => r.rubric !== "yes"
        ).length;
        const offlineNoRubric = offline.filter((t) => !(t.rubricData ?? "").trim()).length;

        let message = "Uncheck any assignments you do not want graded, then proceed.";
        if (noRubricLmsCount > 0) {
          message += ` ${noRubricLmsCount} assignment(s) have no rubric - a rubric is generated via the LLM for each at grading time.`;
          if (offlineNoRubric > 0) {
            message += ` ${offlineNoRubric} offline course(s) also have no saved rubric.`;
          }
        }

        result.requireInput = {
          message,
          key: "plan",
          kind: "table",
          selectable: true,
          submitLabel: "Proceed with selected",
          columns: [
            { key: "course", label: "Course" },
            { key: "assignment", label: "Assignment" },
            { key: "toGrade", label: "To grade" },
            { key: "rubric", label: "Rubric" },
          ],
          rows: displayRows,
          transform: (value) => {
            const rows = Array.isArray(value)
              ? (value as Array<Record<string, string>>)
              : [];
            const keep = new Set(rows.map((r) => Number(r.planIndex)));
            // Offline rows always ride along; only LMS rows are selectable.
            return plan.filter((p, idx) => p.offline || keep.has(idx));
          },
        };
      } else if (offline.length > 0) {
        // No LMS rows but offline rows exist - keep old requireConfirmation logic
        const offlineNoRubric = offline.filter((t) => !(t.rubricData ?? "").trim()).length;
        if (offlineNoRubric > 0) {
          result.requireConfirmation = `${offlineNoRubric} offline course(s) have no saved rubric - rubrics will be generated via the LLM where missing. Continue to grade with them, or cancel to stop.`;
        }
      }

      return result;
    },
  },

  {
    type: "collect-offline-submissions",
    name: "Collect offline submissions",
    description: "When a selected course has no LMS, pause to upload its submissions as a zip.",
    inputs: [
      {
        key: "courses",
        label: "Courses",
        type: "hubCourseList",
        required: true,
      },
    ],
    outputs: [{ key: "submissionsZip", label: "Submissions zip", type: "uploads" }],
    run: async (values) => {
      const ids = String(values.courses ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const hub = await listCourseHubAction();
      if ("error" in hub) {
        throw new Error(hub.error);
      }

      const offline = ids
        .map((id) => hub.courses.find((c) => c.id === id))
        .filter((t): t is typeof hub.courses[0] => !!t && !(t.canvasUrl ?? "").trim());

      if (offline.length === 0) {
        return {
          outputs: { submissionsZip: [] },
          summary: { kind: "text" as const, text: "Skipped - every selected course has an LMS." },
        };
      }

      const offlineNames = offline.map((t) => t.name).join(", ");
      // One zip grades one course: with several offline courses the upload is
      // applied to the first listed one only, and the prompt says so.
      const message =
        offline.length === 1
          ? `${offlineNames} has no LMS. Upload a zip of submissions to grade offline, or skip to grade only the LMS courses.`
          : `${offlineNames} have no LMS. Upload a zip of submissions to grade offline - it is graded against ${offline[0].name} (the first listed); run Grade Submissions again for the others. Skip to grade only the LMS courses.`;
      return {
        outputs: { submissionsZip: [] },
        summary: {
          kind: "text" as const,
          text: `${offline.length} course(s) have no LMS: ${offlineNames}.`,
        },
        requireInput: {
          message,
          key: "submissionsZip",
          kind: "upload",
          optional: true,
        },
      };
    },
  },

  {
    type: "grade-submissions",
    name: "Grade submissions",
    description:
      "Grade every ungraded submission per assignment using its rubric (generating one via the LLM when missing) and prepare the grades for posting.",
    inputs: [
      {
        key: "plan",
        label: "Grading plan",
        type: "courseList",
        required: true,
      },
      {
        key: "submissionsZip",
        label: "Submissions zip",
        type: "uploads",
        required: false,
      },
      {
        key: "courses",
        label: "Courses",
        type: "hubCourseList",
        required: true,
      },
    ],
    outputs: [
      { key: "runs", label: "Grading runs", type: "courseList" },
      { key: "approvedGrades", label: "Approved grades", type: "courseList" },
    ],
    run: async (values, helpers, onProgress) => {
      interface PlanRow {
        courseId: string;
        courseName: string;
        institution?: string;
        canvasUrl?: string;
        assignmentName?: string;
        assignmentId?: string;
        rubricText?: string;
        description?: string;
        pointsPossible?: number | null;
        offline?: boolean;
      }

      const plan = Array.isArray(values.plan)
        ? (values.plan as PlanRow[])
        : [];

      const hub = await listCourseHubAction();
      if ("error" in hub) {
        throw new Error(hub.error);
      }

      const tileMap = new Map(hub.courses.map((c) => [c.id, c]));
      const zips = Array.isArray(values.submissionsZip) ? (values.submissionsZip as File[]) : [];

      // GradingRunEntry (src/lib/grade.ts) is shared with grade-to-draft and
      // review-grading-draft so every producer of a `runs` array agrees on
      // its shape and on runIndex/resultIndex numbering (see
      // buildGradingReviewRows below).
      const runs: GradingRunEntry[] = [];
      const lines: string[] = [];

      for (const row of plan) {
        if (row.offline) continue;

        try {
          let rubricText = (row.rubricText ?? "").trim();

          if (!rubricText) {
            onProgress(
              `Generating rubric for ${row.courseName} - ${row.assignmentName}...`
            );
            const rubricResult = await generateAssignmentRubricAction(
              row.assignmentName ?? "",
              row.description ?? "",
              helpers.provider
            );

            if (typeof rubricResult === "string") {
              rubricText = rubricResult;
            } else {
              lines.push(
                `${row.courseName} - ${row.assignmentName}: rubric generation failed: ${
                  rubricResult.error
                }`
              );
              continue;
            }
          }

          onProgress(
            `Grading ${row.courseName} - ${row.assignmentName}...`
          );

          const formData = new FormData();
          formData.set("canvasUrl", row.canvasUrl ?? "");
          formData.set("provider", helpers.provider);
          formData.set("rubric", rubricText);
          // Canvas descriptions are often empty and the LLM path requires
          // instructions, so fall back to the assignment name (Live Feed style).
          formData.set(
            "assignmentInstructions",
            row.description ||
              row.assignmentName ||
              "Grade each submission against the rubric."
          );
          formData.set("institution", row.institution ?? "");

          const gradeResult = await gradeAction({ run: null, error: null }, formData);

          if (gradeResult.error) {
            lines.push(
              `${row.courseName} - ${row.assignmentName}: ${gradeResult.error}`
            );
            continue;
          }

          if (!gradeResult.run) {
            lines.push(
              `${row.courseName} - ${row.assignmentName}: no submissions to grade`
            );
            continue;
          }

          runs.push({
            courseName: row.courseName,
            assignmentName: row.assignmentName ?? "",
            canvasUrl: row.canvasUrl ?? "",
            run: gradeResult.run,
            institution: row.institution,
            assignmentId: row.assignmentId,
            pointsPossible: row.pointsPossible,
          });

          lines.push(
            `${row.courseName} - ${row.assignmentName}: graded ${gradeResult.run.results.length} submission(s)`
          );
        } catch (err) {
          lines.push(
            `${row.courseName} - ${row.assignmentName ?? "unknown"}: ${
              err instanceof Error ? err.message : "failed"
            }`
          );
        }
      }

      if (zips.length > 0) {
        try {
          // One zip = one course: the upload grades the first offline row and
          // every further offline row gets an honest "not graded" line.
          const offlineRows = plan.filter((r) => r.offline);
          const offlineRow = offlineRows[0];
          if (offlineRow) {
            const courseTile = tileMap.get(offlineRow.courseId);
            const rubric = courseTile?.rubricData ?? "";

            onProgress("Grading offline submissions...");
            const formData = new FormData();
            formData.set("studentSubmissions", zips[0]);
            formData.set("rubric", rubric);
            formData.set("provider", helpers.provider);
            // The zip grading path requires instructions even when the rubric
            // is empty (one is generated from them in that case).
            formData.set(
              "assignmentInstructions",
              "Grade each student submission against the rubric."
            );

            const gradeResult = await gradeAction({ run: null, error: null }, formData);

            if (gradeResult.error) {
              lines.push(`Offline grading: ${gradeResult.error}`);
            } else if (gradeResult.run) {
              runs.push({
                courseName: offlineRow.courseName,
                assignmentName: "Offline submission",
                canvasUrl: "",
                run: gradeResult.run,
                offline: true,
              });
              lines.push(
                `${offlineRow.courseName}: graded ${gradeResult.run.results.length} submission(s)`
              );
            }

            for (const skippedRow of offlineRows.slice(1)) {
              lines.push(
                `${skippedRow.courseName}: not graded - run Grade Submissions again with only this course selected.`
              );
            }

            if (zips.length > 1) {
              lines.push("Note: only the first zip was graded");
            }
          }
        } catch (err) {
          lines.push(
            `Offline grading failed: ${err instanceof Error ? err.message : "unknown error"}`
          );
        }
      }

      // Only rows with a numeric Canvas user id can be posted; promising
      // run.results.length posts would overcount on providers that return none.
      const nonOfflineRuns = runs.filter((r) => !r.offline);
      const postable = countPostableResults(runs);
      if (nonOfflineRuns.length > 0 && postable === 0) {
        lines.push(
          "No rows carry a Canvas user id - nothing can be posted (provider limitation)"
        );
      }

      const result: StepRunResult = {
        outputs: { runs, approvedGrades: [] },
        summary: { kind: "list", label: "Grading complete", items: lines },
      };

      if (postable > 0) {
        // Build review rows from postable entries; runIndex indexes the FULL runs array
        // so post-grades and rowDetail lookups agree when any offline run is present.
        // Shared with review-grading-draft (see grading-review-rows.ts) so the
        // two producers of this review table can never number rows differently.
        const reviewRows = buildGradingReviewRows(runs);

        result.requireInput = {
          message: `Review the grades below - open a submission to check the student's work, edit scores or comments, then approve to post ${postable} grade(s) to the LMS. Uncheck a row to leave that student out of the post. Skip to finish without posting.`,
          key: "approvedGrades",
          kind: "table",
          optional: true,
          selectable: true,
          submitLabel: "Approve grades",
          columns: [
            { key: "course", label: "Course" },
            { key: "assignment", label: "Assignment" },
            { key: "student", label: "Student", width: 140 },
            { key: "submission", label: "Submission", link: true, width: 90 },
            { key: "grade", label: "Grade", editable: true, width: 80 },
            { key: "outOf", label: "Out of", width: 70 },
            { key: "comment", label: "Comment", editable: true, multiline: true },
          ],
          rows: reviewRows,
          rowDetail: async (row) => {
            const entry = runs[Number(row.runIndex)];
            const gradeResult = entry?.run.results[Number(row.resultIndex)];
            if (!entry || !gradeResult) {
              throw new Error("Submission details are unavailable for this row.");
            }
            // Everything the grader saw is still in memory: rubric breakdown,
            // formatted feedback, the grading-time code run, and the submitted
            // files. Canvas is contacted only when no files were kept (a
            // text-only submission) to recover the text body.
            const sections: string[] = [gradeResult.student];
            if (gradeResult.rubricAreas.length > 0) {
              sections.push(
                [
                  "Rubric breakdown:",
                  ...gradeResult.rubricAreas.map(
                    (a) => `- ${a.area}: ${a.score}${a.comment ? ` (${a.comment})` : ""}`
                  ),
                ].join("\n")
              );
            }
            if (gradeResult.feedback.trim()) {
              sections.push(`AI feedback:\n${gradeResult.feedback.trim()}`);
            }
            if (gradeResult.codeExecution) {
              const ce = gradeResult.codeExecution;
              const status = ce.error
                ? `could not run (${ce.error})`
                : ce.ran
                  ? "ran cleanly (exit 0)"
                  : `failed (exit ${ce.exitCode ?? "unknown"})`;
              const output = (ce.stdout || ce.stderr || ce.compileOutput || "").trim();
              sections.push(
                `Code run during grading: ${status}${output ? `\n${output.slice(0, 2000)}` : ""}`
              );
            }
            if (gradeResult.submittedFiles.length > 0) {
              return {
                text: sections.join("\n\n"),
                files: gradeResult.submittedFiles.map((f) => ({
                  name: f.name,
                  base64: f.rawBase64 ?? encodeTextBase64(f.previewContent),
                  mimeType: f.mimeType ?? "text/plain",
                })),
              };
            }
            if (!entry.offline && typeof gradeResult.userId === "number") {
              const courseId = parseCanvasCourseId(entry.canvasUrl ?? "");
              if (entry.institution && courseId && entry.assignmentId) {
                const pulled = await pullSubmissionAction(
                  entry.institution,
                  courseId,
                  entry.assignmentId,
                  gradeResult.userId
                );
                if (!("error" in pulled)) {
                  const s = pulled.submission;
                  sections.push(
                    s.text?.trim() ? `Text submission:\n${s.text.trim()}` : "(no text submission)"
                  );
                  return { text: sections.join("\n\n"), files: s.files ?? [] };
                }
              }
            }
            return { text: sections.join("\n\n"), files: [] };
          },
        };
      }

      return result;
    },
  },

  {
    // HEADLESS (unattended-safe): the AI *scoring* half of grading, split out
    // so it can run on a schedule with nobody watching. It NEVER sets
    // requireInput/requireConfirmation and NEVER calls postCanvasGradesAction
    // - it only grades and saves a durable draft (saveGradingDraftAction).
    // Grades reach Canvas exclusively through the app-open
    // review-grading-draft -> post-grades pair, after a human approves rows
    // in the review table. See HEADLESS_SAFE_STEP_TYPES in headless.ts.
    type: "grade-to-draft",
    name: "Grade submissions to a draft",
    description:
      "Unattended AI scoring only: grade every LMS assignment with pending submissions and save the results as a draft. Nothing is posted to Canvas by this step - review and post the draft separately with Review Graded Drafts.",
    inputs: [
      {
        key: "courses",
        label: "Courses",
        type: "hubCourseList",
        required: false,
        help: "Leave empty and pick an institution instead to grade every course with pending submissions.",
      },
      {
        key: "institution",
        label: "Institution",
        type: "institution",
        required: false,
        help: "Used when no course tiles are selected: every course at this institution with assignments awaiting grading is included.",
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

      // Mirrors grading-preflight's PlanRow (registry.ts, "grading-preflight"
      // above) minus the fields only that step's review table needs.
      interface PlanRow {
        courseName: string;
        institution?: string;
        canvasUrl?: string;
        assignmentName?: string;
        assignmentId?: string;
        rubricText?: string;
        description?: string;
        pointsPossible?: number | null;
      }

      const plan: PlanRow[] = [];
      const lines: string[] = [];
      const queueErrors: Array<{ acronym: string; error: string }> = [];

      // Institution-wide mode: no tiles selected - mirrors grading-preflight.
      if (ids.length === 0) {
        const acronym = String(values.institution ?? "").trim().toUpperCase();
        if (!acronym) {
          throw new Error("Select one or more course tiles, or pick an institution.");
        }

        onProgress("Loading grading queue...");
        const queueResult = await listGradingQueueAction([acronym]);
        if ("error" in queueResult) {
          throw new Error(queueResult.error);
        }

        const { rows: queueRows, errors } = queueResult;
        queueErrors.push(...errors);
        for (const e of errors) {
          lines.push(`Institution ${e.acronym}: ${e.error}`);
        }

        for (const row of queueRows) {
          plan.push({
            courseName: row.courseName || row.canvasUrl,
            institution: row.institution,
            canvasUrl: row.canvasUrl,
            assignmentName: row.title,
            assignmentId: row.assignmentId,
            rubricText: row.rubricText ?? "",
            description: row.description ?? "",
            pointsPossible: row.pointsPossible,
          });
        }

        if (plan.length === 0 && queueErrors.length > 0) {
          throw new Error(
            `The grading queue could not be loaded for ${acronym}: ${queueErrors
              .map((e) => e.error)
              .join("; ")}`
          );
        }
      } else {
        // Tile-based mode: fail-forward per missing tile. Offline tiles (no
        // canvasUrl) are SKIPPED entirely - there is no unattended path for
        // them (no browser to upload a zip); each is noted below instead.
        const tiles: Course[] = [];
        for (const id of ids) {
          const tile = hub.courses.find((c) => c.id === id);
          if (!tile) {
            lines.push(`${id}: not found - skipped`);
            continue;
          }
          tiles.push(tile);
        }

        const withLms = tiles.filter((t) => (t.canvasUrl ?? "").trim());
        const offline = tiles.filter((t) => !(t.canvasUrl ?? "").trim());
        for (const tile of offline) {
          lines.push(
            `${tile.name}: no LMS - unattended grading has no upload step, skipped (run Grade Submissions in the app to grade it offline).`
          );
        }

        const resolveAcronym = (t: Course): string =>
          (t.institution || helpers.activeInstitution || "").trim().toUpperCase();
        const acronyms = [...new Set(withLms.map(resolveAcronym).filter(Boolean))];

        if (withLms.length > 0) {
          onProgress("Loading grading queue...");
          const queueResult = await listGradingQueueAction(acronyms);
          if ("error" in queueResult) {
            throw new Error(queueResult.error);
          }

          const { rows: queueRows, errors } = queueResult;
          queueErrors.push(...errors);
          for (const e of errors) {
            lines.push(`Institution ${e.acronym}: ${e.error}`);
          }

          for (const tile of withLms) {
            const tileCanvasId = parseCanvasCourseId(tile.canvasUrl ?? "");
            if (!tileCanvasId) {
              lines.push(`${tile.name}: the LMS URL has no /courses/<id> - skipped`);
              continue;
            }

            const tileAcronym = resolveAcronym(tile);
            const tileRows = queueRows.filter((row) => {
              const rowCanvasId = parseCanvasCourseId(row.canvasUrl);
              return (
                rowCanvasId === tileCanvasId &&
                row.institution.trim().toUpperCase() === tileAcronym
              );
            });

            for (const row of tileRows) {
              plan.push({
                courseName: tile.name,
                institution: row.institution,
                canvasUrl: row.canvasUrl,
                assignmentName: row.title,
                assignmentId: row.assignmentId,
                rubricText: row.rubricText ?? "",
                description: row.description ?? "",
                pointsPossible: row.pointsPossible,
              });
            }
          }
        }

        if (plan.length === 0 && queueErrors.length > 0) {
          throw new Error(
            `The grading queue could not be loaded for ${queueErrors
              .map((e) => e.acronym)
              .join(", ")}: ${queueErrors.map((e) => e.error).join("; ")}`
          );
        }
      }

      if (plan.length === 0) {
        lines.push("Nothing needs grading - no draft saved.");
        return {
          outputs: {},
          summary: { kind: "list", label: "Nothing to grade", items: lines },
        };
      }

      // Grade every plan row with the EXACT loop grade-submissions uses (same
      // rubric-generation fallback, same gradeAction FormData) so unattended
      // scores match the interactive flow.
      const runs: GradingRunEntry[] = [];

      for (const row of plan) {
        try {
          let rubricText = (row.rubricText ?? "").trim();

          if (!rubricText) {
            onProgress(`Generating rubric for ${row.courseName} - ${row.assignmentName}...`);
            const rubricResult = await generateAssignmentRubricAction(
              row.assignmentName ?? "",
              row.description ?? "",
              helpers.provider
            );

            if (typeof rubricResult === "string") {
              rubricText = rubricResult;
            } else {
              lines.push(
                `${row.courseName} - ${row.assignmentName}: rubric generation failed: ${rubricResult.error}`
              );
              continue;
            }
          }

          onProgress(`Grading ${row.courseName} - ${row.assignmentName}...`);

          const formData = new FormData();
          formData.set("canvasUrl", row.canvasUrl ?? "");
          formData.set("provider", helpers.provider);
          formData.set("rubric", rubricText);
          formData.set(
            "assignmentInstructions",
            row.description ||
              row.assignmentName ||
              "Grade each submission against the rubric."
          );
          formData.set("institution", row.institution ?? "");

          // gradeAction only reads from Canvas and scores with the LLM - it
          // never writes back. Posting only ever happens in the post-grades
          // step, below, after human review.
          const gradeResult = await gradeAction({ run: null, error: null }, formData);

          if (gradeResult.error) {
            lines.push(`${row.courseName} - ${row.assignmentName}: ${gradeResult.error}`);
            continue;
          }

          if (!gradeResult.run) {
            lines.push(`${row.courseName} - ${row.assignmentName}: no submissions to grade`);
            continue;
          }

          runs.push({
            courseName: row.courseName,
            assignmentName: row.assignmentName ?? "",
            canvasUrl: row.canvasUrl ?? "",
            run: gradeResult.run,
            institution: row.institution,
            assignmentId: row.assignmentId,
            pointsPossible: row.pointsPossible,
          });

          lines.push(
            `${row.courseName} - ${row.assignmentName}: graded ${gradeResult.run.results.length} submission(s)`
          );
        } catch (err) {
          lines.push(
            `${row.courseName} - ${row.assignmentName ?? "unknown"}: ${
              err instanceof Error ? err.message : "failed"
            }`
          );
        }
      }

      if (runs.length === 0) {
        lines.push("Nothing was gradable - no draft saved.");
        return {
          outputs: {},
          summary: { kind: "list", label: "Nothing to grade", items: lines },
        };
      }

      const submissionCount = runs.reduce((sum, r) => sum + r.run.results.length, 0);
      const summary = `${runs.length} assignment(s), ${submissionCount} submission(s) graded - review to post`;

      // Strip rawBase64/previewContent/codeExecution before persisting: a
      // draft never needs submitted-file bytes (post-grades reads only
      // grade/comment/rubric/totalScore/userId; review-grading-draft
      // re-fetches files from Canvas on demand). This keeps the jsonb payload
      // small and is the ONLY thing that leaves this step - nothing here
      // posts to Canvas.
      const strippedRuns = stripGradingRunEntriesForDraft(runs);

      const saveResult = await saveGradingDraftAction(summary, { runs: strippedRuns });
      if ("error" in saveResult) {
        throw new Error(`Could not save the grading draft: ${saveResult.error}`);
      }

      lines.push(`Saved draft: ${summary}`);

      return {
        outputs: {},
        summary: { kind: "list", label: "Draft saved", items: lines },
      };
    },
  },

  {
    // APP-OPEN ONLY: sets requireInput below, so it is deliberately absent
    // from HEADLESS_SAFE_STEP_TYPES in headless.ts and cannot be scheduled
    // unattended. This is the ONLY step that turns a saved draft into
    // something post-grades can act on - grades still only reach Canvas
    // after the user approves rows in the table this step renders.
    type: "review-grading-draft",
    name: "Review a grading draft",
    description:
      "Load the oldest pending grading draft (saved by Grade Submissions to a Draft) into an editable review table. Approving posts the checked rows to the LMS via the next step; skipping leaves the draft pending for later.",
    inputs: [],
    outputs: [
      { key: "runs", label: "Grading runs", type: "courseList" },
      { key: "approvedGrades", label: "Approved grades", type: "courseList" },
    ],
    run: async () => {
      const listResult = await listPendingGradingDraftsAction();
      if ("error" in listResult) {
        throw new Error(listResult.error);
      }

      if (listResult.drafts.length === 0) {
        return {
          outputs: { runs: [], approvedGrades: [] },
          summary: { kind: "text", text: "No pending grading drafts to review." },
        };
      }

      // Oldest first (listPendingGradingDraftsAction orders by created_at
      // ascending), so this always takes the longest-waiting draft.
      const draftId = listResult.drafts[0].id;
      const draftResult = await getGradingDraftAction(draftId);
      if ("error" in draftResult) {
        throw new Error(draftResult.error);
      }

      const runs = draftResult.draft.payload.runs;

      const result: StepRunResult = {
        outputs: { runs, approvedGrades: [] },
        summary: {
          kind: "text",
          text: `Loaded the oldest pending draft: ${draftResult.draft.summary}`,
        },
      };

      // Built from the SAME shared helper grade-submissions uses (see
      // grading-review-rows.ts), over the draft's own runs array, so
      // runIndex/resultIndex agree with what post-grades expects.
      const postable = countPostableResults(runs);

      if (postable === 0) {
        // Nothing to show - mark the draft reviewed now so an empty draft
        // does not sit pending forever (best-effort; markGradingDraftReviewedAction
        // is idempotent, so a failure here just leaves it re-reviewable later).
        void markGradingDraftReviewedAction(draftId).catch(() => {});
        return result;
      }

      const reviewRows = buildGradingReviewRows(runs);

      result.requireInput = {
        message: `Review the grades below - open a submission to check the student's work, edit scores or comments, then approve to post ${postable} grade(s) to the LMS. Uncheck a row to leave that student out of the post. Skip to finish without posting (the draft stays pending for later).`,
        key: "approvedGrades",
        kind: "table",
        optional: true,
        selectable: true,
        submitLabel: "Approve grades",
        columns: [
          { key: "course", label: "Course" },
          { key: "assignment", label: "Assignment" },
          { key: "student", label: "Student", width: 140 },
          { key: "submission", label: "Submission", link: true, width: 90 },
          { key: "grade", label: "Grade", editable: true, width: 80 },
          { key: "outOf", label: "Out of", width: 70 },
          { key: "comment", label: "Comment", editable: true, multiline: true },
        ],
        rows: reviewRows,
        rowDetail: async (row) => {
          const entry = runs[Number(row.runIndex)];
          const gradeResult = entry?.run.results[Number(row.resultIndex)];
          if (!entry || !gradeResult) {
            throw new Error("Submission details are unavailable for this row.");
          }

          const sections: string[] = [gradeResult.student];
          if (gradeResult.rubricAreas.length > 0) {
            sections.push(
              [
                "Rubric breakdown:",
                ...gradeResult.rubricAreas.map(
                  (a) => `- ${a.area}: ${a.score}${a.comment ? ` (${a.comment})` : ""}`
                ),
              ].join("\n")
            );
          }
          if (gradeResult.feedback.trim()) {
            sections.push(`AI feedback:\n${gradeResult.feedback.trim()}`);
          }
          // A draft never carries submittedFiles bytes (stripped before
          // persisting - see stripGradingRunEntriesForDraft), so this always
          // falls through to the Canvas re-fetch branch below.
          if (gradeResult.submittedFiles.length > 0) {
            return {
              text: sections.join("\n\n"),
              files: gradeResult.submittedFiles.map((f) => ({
                name: f.name,
                base64: f.rawBase64 ?? encodeTextBase64(f.previewContent),
                mimeType: f.mimeType ?? "text/plain",
              })),
            };
          }
          if (!entry.offline && typeof gradeResult.userId === "number") {
            const courseId = parseCanvasCourseId(entry.canvasUrl ?? "");
            if (entry.institution && courseId && entry.assignmentId) {
              const pulled = await pullSubmissionAction(
                entry.institution,
                courseId,
                entry.assignmentId,
                gradeResult.userId
              );
              if (!("error" in pulled)) {
                const s = pulled.submission;
                sections.push(
                  s.text?.trim() ? `Text submission:\n${s.text.trim()}` : "(no text submission)"
                );
                return { text: sections.join("\n\n"), files: s.files ?? [] };
              }
            }
          }
          return { text: sections.join("\n\n"), files: [] };
        },
        transform: (value) => {
          const rows = Array.isArray(value) ? (value as Array<Record<string, string>>) : [];
          // Best-effort, fire-and-forget: this closure runs synchronously (the
          // runner does not await it), and it fires ONLY on submit, never on
          // skip (see WorkflowsTab's requireInput resolver - a skip resolves
          // with null and this transform is never called). A failure here is
          // swallowed because markGradingDraftReviewedAction is idempotent -
          // reviewing the same draft again later just marks it reviewed again.
          void markGradingDraftReviewedAction(draftId).catch(() => {});
          return rows;
        },
      };

      return result;
    },
  },

  {
    type: "post-grades",
    name: "Post grades to the LMS",
    description: "Post the prepared grades and rubric scores back to each assignment.",
    inputs: [
      {
        key: "runs",
        label: "Grading runs",
        type: "courseList",
        required: true,
      },
      {
        key: "approvedGrades",
        label: "Approved grades",
        type: "courseList",
        required: false,
        help: "The reviewed rows from the grading step; only these are posted.",
      },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      interface RunEntry {
        courseName: string;
        assignmentName: string;
        canvasUrl: string;
        run: GradingRun;
        offline?: boolean;
      }

      const runs = Array.isArray(values.runs)
        ? (values.runs as RunEntry[])
        : [];

      const approved = Array.isArray(values.approvedGrades)
        ? (values.approvedGrades as Array<Record<string, string>>)
        : [];

      const lines: string[] = [];

      // Check if there are any non-offline runs with numeric userId entries
      const nonOfflineRuns = runs.filter((r) => !r.offline);
      const hasPostableRows = nonOfflineRuns.some((r) =>
        r.run.results.some((row) => typeof row.userId === "number")
      );

      // If there are postable rows but none were approved, skip posting
      if (hasPostableRows && approved.length === 0) {
        for (const entry of runs) {
          if (entry.offline) {
            lines.push(`${entry.courseName}: offline grades not posted (no LMS)`);
          }
        }
        lines.push("Grades were not approved - nothing posted.");
        return {
          outputs: {},
          summary: { kind: "list" as const, label: "Grades posted", items: lines },
        };
      }

      // Group approved rows by runIndex (indexes the FULL runs array so the posting
      // step and grade-submissions detail lookups agree when any offline run is present).
      const approvedByRunIndex = new Map<string, Array<Record<string, string>>>();
      for (const row of approved) {
        const runIndex = row.runIndex ?? "";
        if (!approvedByRunIndex.has(runIndex)) {
          approvedByRunIndex.set(runIndex, []);
        }
        approvedByRunIndex.get(runIndex)!.push(row);
      }

      for (let i = 0; i < runs.length; i++) {
        const entry = runs[i];

        try {
          if (entry.offline) {
            lines.push(`${entry.courseName}: offline grades not posted (no LMS)`);
            continue;
          }

          onProgress(`Posting grades for ${entry.courseName} - ${entry.assignmentName}...`);

          // Collect approved rows for this run
          const runApprovedRows = approvedByRunIndex.get(String(i)) ?? [];
          if (runApprovedRows.length === 0) {
            lines.push(`${entry.courseName} - ${entry.assignmentName}: no approved grades`);
            continue;
          }

          const payload: Array<{
            userId: number;
            grade?: string;
            comment?: string;
            rubricAreas?: Array<{ area: string; score: string; comment: string }>;
          }> = [];

          for (const approvedRow of runApprovedRows) {
            const resultIndex = approvedRow.resultIndex ? parseInt(approvedRow.resultIndex, 10) : null;
            if (resultIndex === null || resultIndex < 0 || resultIndex >= entry.run.results.length) {
              lines.push(`${approvedRow.student}: result index out of range - skipped`);
              continue;
            }

            const result = entry.run.results[resultIndex];
            const userId = result.userId;
            if (typeof userId !== "number") {
              lines.push(`${approvedRow.student}: no Canvas user id - skipped`);
              continue;
            }

            const grade = (approvedRow.grade ?? "").trim();
            if (grade && !grade.match(/^-?\d+(\.\d+)?$/)) {
              lines.push(`${approvedRow.student}: invalid grade "${grade}" - skipped`);
              continue;
            }

            const comment = approvedRow.comment ?? result.overallComment;

            // When the reviewer edited the total, the AI's per-criterion
            // breakdown no longer adds up to it - post the total alone rather
            // than a contradictory rubric.
            const originalGrade = (() => {
              const m =
                result.totalScore.match(/(-?\d+(?:\.\d+)?)\s*\/\s*-?\d+/) ??
                result.totalScore.match(/-?\d+(?:\.\d+)?/);
              return m ? m[1] ?? m[0] : "";
            })();
            // An unparseable AI total counts as edited too: the reviewer's
            // typed grade cannot be reconciled with the AI's breakdown.
            const gradeEdited =
              grade !== "" && (originalGrade === "" || parseFloat(grade) !== parseFloat(originalGrade));
            if (gradeEdited) {
              lines.push(
                `${approvedRow.student}: total edited (${originalGrade || "unparsed"} -> ${grade}) - rubric breakdown omitted`
              );
            }

            payload.push({
              userId,
              grade: grade || undefined,
              comment,
              rubricAreas: gradeEdited
                ? undefined
                : result.rubricAreas.map((a) => ({
                    area: a.area,
                    score: a.score,
                    comment: "",
                  })),
            });
          }

          if (payload.length === 0) {
            lines.push(`${entry.courseName} - ${entry.assignmentName}: no gradable submissions`);
            continue;
          }

          const postResult = await postCanvasGradesAction(entry.canvasUrl, payload);

          if ("error" in postResult) {
            lines.push(`${entry.courseName} - ${entry.assignmentName}: ${postResult.error}`);
          } else {
            lines.push(
              `${entry.courseName} - ${entry.assignmentName}: posted ${postResult.posted}${
                postResult.failures.length ? `, ${postResult.failures.length} failed` : ""
              }`
            );
          }
        } catch (err) {
          lines.push(
            `${entry.courseName} - ${entry.assignmentName ?? "unknown"}: ${
              err instanceof Error ? err.message : "failed"
            }`
          );
        }
      }

      return {
        outputs: {},
        summary: { kind: "list" as const, label: "Grades posted", items: lines },
      };
    },
  },

  {
    type: "generate-full-credit-checklist",
    name: "Generate a full-credit checklist",
    description: "Produce a short student-facing 'how to earn full credit' checklist from an assignment's instructions and rubric.",
    inputs: [
      { key: "instructions", label: "Assignment instructions", type: "longtext", required: true },
      { key: "rubric", label: "Rubric", type: "longtext", required: false },
    ],
    outputs: [
      { key: "checklist", label: "Checklist", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const instructions = String(values.instructions ?? "").trim();
      if (!instructions) throw new Error("Provide the assignment instructions.");
      const rubric = String(values.rubric ?? "");

      onProgress("Generating checklist...");
      const r = await generateFullCreditChecklistAction(instructions, rubric, helpers.provider);
      if ("error" in r) throw new Error(r.error);

      return {
        outputs: { checklist: r.checklist },
        summary: { kind: "text", text: r.checklist },
      };
    },
  },

  {
    type: "list-announcements",
    name: "List course announcements",
    description: "Read a course's existing LMS announcements (scheduled ones surfaced first) so a later step can avoid duplicating them.",
    inputs: [
      {
        key: "course",
        label: "LMS course",
        type: "lmsCourse",
        required: true,
      },
      {
        key: "institution",
        label: "Institution",
        type: "institution",
        required: false,
        help: "Defaults to the active institution.",
      },
    ],
    outputs: [
      { key: "announcements", label: "Announcements", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const course = String(values.course ?? "").trim();
      if (!course) {
        return {
          outputs: { announcements: "" },
          summary: {
            kind: "text",
            text: "Skipped - no LMS course selected.",
          },
        };
      }

      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;

      onProgress("Loading announcements...");
      const r = await listAnnouncementsAction(course, inst);

      if ("error" in r) {
        throw new Error(r.error);
      }

      const titles: string[] = [];
      const lines: string[] = [];

      for (const announcement of r.announcements) {
        const title = announcement.title.trim();
        titles.push(title || "(untitled)");

        let line = title || "(untitled)";
        if (announcement.delayedPostAt && !announcement.postedAt) {
          line += ` (scheduled for ${announcement.delayedPostAt})`;
        }
        lines.push(line);
      }

      const announcements = lines.join("\n");

      return {
        outputs: { announcements },
        summary: {
          kind: "list",
          label: `${r.announcements.length} announcement(s) in ${r.courseName}`,
          items: titles.length > 0 ? titles : ["(none)"],
        },
      };
    },
  },

  {
    type: "draft-announcement",
    name: "Draft an announcement",
    description: "Draft a warm, professional course announcement (subject and body) from a short instruction, ready to review or post in a later step.",
    inputs: [
      {
        key: "instruction",
        label: "What should it say?",
        type: "longtext",
        required: true,
      },
    ],
    outputs: [
      { key: "announcementTitle", label: "Announcement title", type: "text" },
      { key: "announcement", label: "Announcement body", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const instruction = String(values.instruction ?? "").trim();
      if (!instruction) {
        throw new Error("Describe what the announcement should say first.");
      }

      onProgress("Drafting announcement...");
      const r = await draftAnnouncementAction(instruction, helpers.provider);

      if ("error" in r) {
        throw new Error(r.error);
      }

      return {
        outputs: { announcementTitle: r.title, announcement: r.message },
        summary: {
          kind: "text",
          text: `${r.title}\n\n${r.message}`,
        },
      };
    },
  },

  {
    type: "post-announcement",
    name: "Post an announcement",
    description: "Publish an announcement to the LMS course (immediately, or scheduled for a future date). Attended-only: wire the title and body from Draft an announcement, or type them in.",
    inputs: [
      {
        key: "course",
        label: "LMS course",
        type: "lmsCourse",
        required: true,
      },
      {
        key: "announcementTitle",
        label: "Title",
        type: "text",
        required: true,
      },
      {
        key: "announcement",
        label: "Body",
        type: "longtext",
        required: true,
      },
      {
        key: "postAt",
        label: "Schedule for",
        type: "date",
        required: false,
        help: "Leave blank to post now; set a future date to schedule.",
      },
      {
        key: "institution",
        label: "Institution",
        type: "institution",
        required: false,
        help: "Defaults to the active institution.",
      },
    ],
    outputs: [
      { key: "announcementUrl", label: "Announcement URL", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const course = String(values.course ?? "").trim();
      if (!course) throw new Error("Select an LMS course to post to.");
      const title = String(values.announcementTitle ?? "").trim();
      const body = String(values.announcement ?? "").trim();
      if (!title || !body) throw new Error("Provide a title and body (wire these from Draft an announcement).");
      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;
      const postAt = String(values.postAt ?? "").trim() || undefined;
      onProgress(postAt ? "Scheduling announcement..." : "Posting announcement...");
      const r = await createAnnouncementAction(course, title, body, inst, postAt);
      if ("error" in r) throw new Error(r.error);
      return {
        outputs: { announcementUrl: r.announcement.htmlUrl },
        summary: {
          kind: "link",
          label: postAt ? `Scheduled "${title}"` : `Posted "${title}"`,
          url: r.announcement.htmlUrl,
        },
      };
    },
  },

  {
    type: "read-inbox",
    name: "Read the message inbox",
    description: "List the LMS inbox conversations, and optionally load one full thread by id, so a later step can triage or draft a reply.",
    inputs: [
      {
        key: "institution",
        label: "Institution",
        type: "institution",
        required: false,
        help: "Defaults to the active institution.",
      },
      {
        key: "conversationId",
        label: "Conversation id",
        type: "text",
        required: false,
        help: "Optional - load this thread's full text; leave blank to just list the inbox.",
      },
    ],
    outputs: [
      { key: "conversations", label: "Inbox list", type: "longtext" },
      { key: "thread", label: "Selected thread", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;

      onProgress("Loading inbox...");
      const r = await listConversationsAction(inst);
      if ("error" in r) throw new Error(r.error);

      const subjects: string[] = [];
      const convLines: string[] = [];

      for (const conv of r.conversations) {
        subjects.push(conv.subject);
        const snippet = conv.lastMessage ? conv.lastMessage.substring(0, 60).replace(/\n/g, " ") : "(no message)";
        const participantsStr = conv.participants.join(", ") || "(no participants)";
        convLines.push(
          `${conv.subject} | ${participantsStr} | ${snippet}${conv.lastMessage && conv.lastMessage.length > 60 ? "..." : ""}`
        );
      }

      const conversations = convLines.join("\n");

      let thread = "";
      const convId = String(values.conversationId ?? "").trim();
      if (convId && /^\d+$/.test(convId)) {
        onProgress("Loading thread...");
        const d = await getConversationAction(Number(convId), inst);
        if ("error" in d) throw new Error(d.error);

        const threadLines = [`Subject: ${d.conversation.subject}`, ""];
        threadLines.push("Participants: " + d.conversation.participants.join(", "));
        threadLines.push("");

        for (const msg of d.conversation.messages) {
          threadLines.push(`${msg.author}: ${msg.body}`);
          if (msg.createdAt) {
            threadLines.push(`(${msg.createdAt})`);
          }
          threadLines.push("");
        }

        thread = threadLines.join("\n");
      }

      return {
        outputs: { conversations, thread },
        summary: {
          kind: "list",
          label: `${r.conversations.length} conversation(s)`,
          items: subjects.length ? subjects : ["(inbox empty)"],
        },
      };
    },
  },

  {
    type: "draft-message-reply",
    name: "Draft a reply to a student message",
    description: "Draft a courteous reply to a student's message thread, ready to review and send in a later step.",
    inputs: [
      { key: "thread", label: "Conversation thread", type: "longtext", required: true, help: "The thread text, e.g. wired from Read the message inbox." },
      { key: "instructions", label: "Reply guidance", type: "longtext", required: false, help: "Optional - what the reply should say or emphasize." },
    ],
    outputs: [
      { key: "draftReply", label: "Draft reply", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const thread = String(values.thread ?? "").trim();
      if (!thread) {
        throw new Error("Provide the conversation thread to reply to (wire it from Read the message inbox).");
      }
      const instructions = String(values.instructions ?? "");
      onProgress("Drafting reply...");
      const r = await draftMessageReplyAction(thread, instructions, helpers.provider);
      if ("error" in r) throw new Error(r.error);
      return { outputs: { draftReply: r.body }, summary: { kind: "text", text: r.body } };
    },
  },

  {
    type: "reply-to-conversation",
    name: "Send a reply to a student message",
    description: "Send a reply to an LMS inbox conversation. Attended-only: wire the reply text from Draft a reply to a student message.",
    inputs: [
      { key: "conversationId", label: "Conversation id", type: "text", required: true },
      { key: "body", label: "Reply", type: "longtext", required: true, help: "The reply text, e.g. wired from Draft a reply to a student message." },
      { key: "institution", label: "Institution", type: "institution", required: false, help: "Defaults to the active institution." },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const convId = String(values.conversationId ?? "").trim();
      if (!convId || !/^\d+$/.test(convId)) {
        throw new Error("Provide the numeric conversation id to reply to.");
      }

      const body = String(values.body ?? "").trim();
      if (!body) {
        throw new Error("Provide the reply text (wire it from Draft a reply to a student message).");
      }

      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;

      onProgress("Sending reply...");
      const r = await replyToConversationAction(Number(convId), body, inst);
      if ("error" in r) throw new Error(r.error);

      return {
        outputs: {},
        summary: { kind: "text", text: `Reply sent on conversation ${convId}.` },
      };
    },
  },

  {
    type: "triage-inbox",
    name: "Triage an inbox conversation",
    description: "Mark an LMS inbox conversation read, unread, or archived after it has been handled.",
    inputs: [
      { key: "conversationId", label: "Conversation id", type: "text", required: true },
      { key: "state", label: "New state", type: "text", required: true, help: "read, unread, or archived." },
      { key: "institution", label: "Institution", type: "institution", required: false, help: "Defaults to the active institution." },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const convId = String(values.conversationId ?? "").trim();
      if (!convId || !/^\d+$/.test(convId)) {
        throw new Error("Provide the numeric conversation id.");
      }

      const state = String(values.state ?? "").trim().toLowerCase();
      if (state !== "read" && state !== "unread" && state !== "archived") {
        throw new Error("State must be read, unread, or archived.");
      }

      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;

      onProgress("Updating conversation...");
      const r = await setConversationStateAction(Number(convId), state as "read" | "unread" | "archived", inst);
      if ("error" in r) throw new Error(r.error);

      return {
        outputs: {},
        summary: { kind: "text", text: `Conversation ${convId} marked ${state}.` },
      };
    },
  },

  {
    type: "detect-meeting-request",
    name: "Detect a meeting request",
    description: "Classify whether a message thread is asking to meet live, with a confidence score, so a workflow can branch toward scheduling.",
    inputs: [
      { key: "thread", label: "Conversation thread", type: "longtext", required: true, help: "The thread text, e.g. wired from Read the message inbox." },
    ],
    outputs: [
      { key: "isMeetingRequest", label: "Is a meeting request", type: "boolean" },
      { key: "confidence", label: "Confidence", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      const thread = String(values.thread ?? "").trim();
      if (!thread) {
        throw new Error("Provide the conversation thread to classify.");
      }
      onProgress("Classifying...");
      const r = await detectMeetingRequestAction(thread, helpers.provider);
      const pct = Math.round(r.confidence * 100);
      return {
        outputs: {
          isMeetingRequest: r.isMeetingRequest ? "1" : "",
          confidence: r.confidence,
        },
        summary: {
          kind: "text",
          text: `Meeting request: ${r.isMeetingRequest ? "yes" : "no"} (confidence ${pct}%)`,
        },
      };
    },
  },

  {
    type: "find-open-slots",
    name: "Find open meeting slots",
    description: "Compute the instructor's open meeting slots within working hours (time-zone aware). Emits ISO slots to feed a scheduling reply and human-readable labels.",
    inputs: [
      { key: "timeZone", label: "Time zone", type: "text", required: false, help: "Optional IANA zone (e.g. America/Chicago); blank uses your configured zone." },
    ],
    outputs: [
      { key: "slotsIso", label: "Open slots (ISO)", type: "longtext" },
      { key: "slots", label: "Open slots", type: "longtext" },
      { key: "timeZone", label: "Time zone", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const tz = String(values.timeZone ?? "").trim() || undefined;
      onProgress("Finding open times...");
      const r = await getAvailableSlotsAction(tz);
      if ("error" in r) {
        throw new Error(r.error);
      }
      const slotsIso = r.slots.join("\n");
      const slotsText = r.slotLabels.join("\n");
      return {
        outputs: {
          slotsIso,
          slots: slotsText,
          timeZone: r.timeZone,
        },
        summary: {
          kind: "list",
          label: `${r.slots.length} open slot(s)`,
          items: r.slotLabels.length ? r.slotLabels : ["(no open slots)"],
        },
      };
    },
  },

  {
    type: "draft-meeting-reply",
    name: "Draft a scheduling reply",
    description: "Draft a reply proposing meeting times from the open slots, ready to review and send.",
    inputs: [
      { key: "thread", label: "Conversation thread", type: "longtext", required: true, help: "The student's message thread." },
      { key: "slotsIso", label: "Open slots (ISO)", type: "longtext", required: true, help: "ISO slots, one per line, e.g. wired from Find open meeting slots." },
      { key: "timeZone", label: "Time zone", type: "text", required: false, help: "Optional IANA zone to label the offered times." },
    ],
    outputs: [
      { key: "reply", label: "Draft reply", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const thread = String(values.thread ?? "").trim();
      if (!thread) throw new Error("Provide the conversation thread.");
      const slots = String(values.slotsIso ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
      if (slots.length === 0) throw new Error("Provide open time slots (wire them from Find open meeting slots).");
      const tz = String(values.timeZone ?? "").trim() || undefined;
      onProgress("Drafting reply...");
      const r = await draftMeetingReplyAction(thread, slots, helpers.provider, tz);
      if ("error" in r) throw new Error(r.error);
      return { outputs: { reply: r.body }, summary: { kind: "text", text: r.body } };
    },
  },

  {
    type: "book-meeting",
    name: "Book a meeting",
    description: "Create a calendar event with a Google Meet link and invite the student. Attended-only: wire the start time from an approved open slot.",
    inputs: [
      { key: "startISO", label: "Start time (ISO)", type: "text", required: true, help: "ISO datetime, e.g. one of the open slots." },
      { key: "studentName", label: "Student name", type: "text", required: false },
      { key: "studentEmail", label: "Student email", type: "text", required: false },
      { key: "timeZone", label: "Time zone", type: "text", required: false, help: "Optional IANA zone for the event." },
    ],
    outputs: [
      { key: "meetUrl", label: "Meet link", type: "text" },
      { key: "eventUrl", label: "Calendar event", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const startISO = String(values.startISO ?? "").trim();
      if (!startISO) throw new Error("Provide the meeting start time (ISO).");
      const studentName = String(values.studentName ?? "").trim() || undefined;
      const studentEmail = String(values.studentEmail ?? "").trim() || undefined;
      const tz = String(values.timeZone ?? "").trim() || undefined;
      onProgress("Booking meeting...");
      const r = await createMeetingAction(startISO, studentName, studentEmail, tz);
      if ("error" in r) throw new Error(r.error);
      const link = r.htmlLink ?? r.meetLink ?? "";
      const result = {
        outputs: { meetUrl: r.meetLink ?? "", eventUrl: r.htmlLink ?? "" },
        summary: link
          ? { kind: "link" as const, label: "Meeting booked", url: link }
          : { kind: "text" as const, text: "Meeting booked." },
      };
      return result;
    },
  },

  {
    type: "parse-academic-calendar",
    name: "Parse an academic calendar",
    description: "Extract typed, categorized calendar events (lectures, exams, deadlines, holidays) from pasted syllabus or calendar text.",
    inputs: [
      {
        key: "text",
        label: "Calendar or syllabus text",
        type: "longtext",
        required: true,
      },
    ],
    outputs: [
      { key: "events", label: "Parsed events", type: "longtext" },
      { key: "school", label: "School", type: "text" },
      { key: "term", label: "Term", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const text = String(values.text ?? "").trim();
      if (!text) {
        throw new Error("Paste the calendar or syllabus text to parse.");
      }

      onProgress("Parsing calendar...");
      const result = parseCalendarEmbedded(text);

      const items = result.events.map((evt) => {
        let line = `${evt.date}`;
        if (evt.endDate) {
          line += ` - ${evt.endDate}`;
        }
        line += ` - ${evt.type}: ${evt.title}`;
        return line;
      });

      const eventCount = result.events.length;
      const school = result.school ?? "";
      const term = result.term ?? "";
      const events = items.join("\n");

      return {
        outputs: {
          events,
          school,
          term,
        },
        summary: {
          kind: "list",
          label: `${eventCount} event(s) parsed`,
          items: items.length ? items : ["(none found)"],
        },
      };
    },
  },

  {
    type: "check-needs-grading",
    name: "Check for work needing grading",
    description: "Count submissions waiting to be graded (and unread messages) for an institution, so a scheduled run can fire only when work is waiting.",
    inputs: [
      {
        key: "institution",
        label: "Institution",
        type: "institution",
        required: false,
        help: "Defaults to the active institution.",
      },
    ],
    outputs: [
      { key: "needsGrading", label: "Submissions needing grading", type: "number" },
      { key: "unread", label: "Unread messages", type: "number" },
      { key: "hasWork", label: "Has work waiting", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || "";
      if (!inst) {
        throw new Error("Select an institution to check.");
      }

      onProgress("Checking for pending work...");
      const r = await getInstitutionCountsAction([inst]);
      if ("error" in r) {
        throw new Error(r.error);
      }

      const needsGrading = r.counts.reduce((n, c) => n + c.needsGrading, 0);
      const unread = r.counts.reduce((n, c) => n + c.unread, 0);

      return {
        outputs: {
          needsGrading,
          unread,
          hasWork: needsGrading > 0 ? "1" : "",
        },
        summary: {
          kind: "text",
          text: `${needsGrading} submission(s) need grading; ${unread} unread message(s).`,
        },
      };
    },
  },

  {
    type: "get-unread-and-notifications",
    name: "Get unread message counts",
    description: "Read unread inbox counts per institution, for a dashboard or digest step.",
    inputs: [
      {
        key: "institutions",
        label: "Institutions",
        type: "longtext",
        required: false,
        help: "One institution acronym per line; blank uses the active institution.",
      },
    ],
    outputs: [
      { key: "unread", label: "Total unread", type: "number" },
      { key: "breakdown", label: "Per-institution breakdown", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const raw = String(values.institutions ?? "")
        .split("\n")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      const acronyms = raw.length ? raw : (helpers.activeInstitution ? [helpers.activeInstitution] : []);

      if (acronyms.length === 0) {
        throw new Error("Select at least one institution.");
      }

      onProgress("Loading unread counts...");
      const r = await getUnreadCountsAction(acronyms);
      if ("error" in r) {
        throw new Error(r.error);
      }

      const unread = r.counts.reduce((n, c) => n + c.unread, 0);
      const breakdown = r.counts.map((c) => `${c.acronym}: ${c.unread} unread`).join("\n");

      return {
        outputs: { unread, breakdown },
        summary: {
          kind: "list",
          label: `${unread} unread message(s)`,
          items: r.counts.map((c) => `${c.acronym}: ${c.unread}`),
        },
      };
    },
  },

  {
    type: "check-student-activity",
    name: "Check student repo activity",
    description: "List each student repo in the org with its last-commit date, flagging repos with no recent activity as at-risk.",
    inputs: [
      { key: "org", label: "Organization", type: "org", required: true },
      { key: "prefix", label: "Repo name prefix", type: "text", required: false, help: "Only repos whose name starts with this." },
      { key: "staleDays", label: "Stale after (days)", type: "number", required: false, help: "Flag repos with no commit in this many days (default 7)." },
    ],
    outputs: [
      { key: "activity", label: "Activity report", type: "longtext" },
      { key: "staleCount", label: "Stale repos", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      const org = String(values.org ?? "").trim();
      if (!org) throw new Error("Provide a GitHub organization.");
      const prefix = String(values.prefix ?? "").trim() || undefined;
      const staleRaw = String(values.staleDays ?? "").trim();
      const staleDays = staleRaw && Number.isFinite(Number(staleRaw)) ? Number(staleRaw) : 7;

      onProgress("Reading student repos...");
      const r = await checkStudentActivityAction(org, prefix);
      if ("error" in r) throw new Error(r.error);

      const cutoff = Date.now() - staleDays * 86400000;
      let staleCount = 0;
      const lines = r.rows.map((row) => {
        const stale = !row.lastCommit || new Date(row.lastCommit).getTime() < cutoff;
        if (stale) staleCount++;
        return `${row.repo}: ${row.lastCommit ? row.lastCommit : "no commits"}${stale ? " (STALE)" : ""}`;
      });

      return {
        outputs: { activity: lines.join("\n"), staleCount },
        summary: { kind: "list", label: `${r.rows.length} repo(s), ${staleCount} stale`, items: lines.length ? lines : ["(no repos found)"] },
      };
    },
  },

  {
    type: "import-lms-syllabus",
    name: "Import syllabus from the LMS",
    description: "Pull an existing syllabus from the live LMS course and save it as a finalized syllabus for reuse.",
    inputs: [
      { key: "course", label: "LMS course", type: "lmsCourse", required: true },
      { key: "courseName", label: "Course name", type: "text", required: false, help: "Names the imported syllabus; defaults to 'Course syllabus'." },
      { key: "institution", label: "Institution", type: "institution", required: false, help: "Defaults to the active institution." },
    ],
    outputs: [
      { key: "syllabusId", label: "Syllabus id", type: "text" },
      { key: "syllabusName", label: "Syllabus name", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const course = String(values.course ?? "").trim();
      if (!course) {
        throw new Error("Select an LMS course to import from.");
      }

      const courseName = String(values.courseName ?? "").trim() || "Course syllabus";
      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;

      onProgress("Importing syllabus from the LMS...");
      const r = await importLmsSyllabusAction(course, inst, courseName);
      if ("error" in r) {
        throw new Error(r.error);
      }

      return {
        outputs: { syllabusId: r.syllabusId, syllabusName: r.name },
        summary: { kind: "text", text: `Imported syllabus "${r.name}".` },
      };
    },
  },

  {
    type: "detect-syllabus-fields",
    name: "Detect syllabus fields to fill",
    description: "Scan syllabus text and list the class-specific fields (instructor, term, office hours, grading, etc.) that need filling, with suggested values.",
    inputs: [
      {
        key: "syllabusText",
        label: "Syllabus text",
        type: "longtext",
        required: true,
      },
    ],
    outputs: [
      {
        key: "fields",
        label: "Detected fields",
        type: "longtext",
      },
    ],
    run: async (values, helpers, onProgress) => {
      const text = String(values.syllabusText ?? "").trim();
      if (!text) {
        throw new Error("Paste the syllabus text to scan.");
      }

      onProgress("Scanning syllabus...");

      const paragraphs = text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, i) => ({ id: String(i), text: line }));

      const detected = scaffoldSyllabusFields(paragraphs);

      const fieldsText = detected.map((f) => `${f.label}: ${f.suggestedText}`).join("\n");

      const items = detected.map((f) => f.label);

      return {
        outputs: { fields: fieldsText },
        summary: {
          kind: "list",
          label: `${detected.length} field(s) to fill`,
          items: items.length ? items : ["(none detected)"],
        },
      };
    },
  },

  {
    type: "regenerate-syllabus-field",
    name: "Regenerate a syllabus field",
    description: "AI-rewrite a single syllabus field (e.g. course description, policies) given its current text and optional context.",
    inputs: [
      { key: "fieldLabel", label: "Field label", type: "text", required: true, help: "e.g. Course description, Grading policy." },
      { key: "currentText", label: "Current text", type: "longtext", required: false },
      { key: "context", label: "Context", type: "longtext", required: false, help: "Optional background (e.g. a codebase or course summary) to steer the rewrite." },
    ],
    outputs: [
      { key: "value", label: "New text", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const label = String(values.fieldLabel ?? "").trim();
      if (!label) throw new Error("Provide the field label to regenerate.");
      const currentText = String(values.currentText ?? "");
      const context = String(values.context ?? "");
      onProgress("Regenerating field...");
      const r = await regenerateSyllabusFieldAction({ label, currentText }, context, {}, helpers.provider);
      if ("error" in r) throw new Error(r.error);
      return { outputs: { value: r.text }, summary: { kind: "text", text: r.text } };
    },
  },

  {
    type: "list-syllabus-templates",
    name: "List syllabus templates",
    description: "Enumerate the saved syllabus templates so a later step can pick one to adapt.",
    inputs: [],
    outputs: [
      { key: "templates", label: "Templates", type: "longtext" },
      { key: "templateIds", label: "Template ids", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      onProgress("Loading templates...");
      const r = await listSyllabusTemplatesAction();
      if ("error" in r) throw new Error(r.error);
      const lines = r.templates.map((t) => `${t.name} (${t.id})`);
      const ids = r.templates.map((t) => t.id).join("\n");
      return {
        outputs: { templates: lines.join("\n"), templateIds: ids },
        summary: {
          kind: "list",
          label: `${r.templates.length} template(s)`,
          items: r.templates.length ? r.templates.map((t) => t.name) : ["(none)"],
        },
      };
    },
  },

  {
    type: "manage-syllabus-template",
    name: "Rename or delete a syllabus template",
    description: "Rename or delete a saved syllabus template. Attended-only.",
    inputs: [
      { key: "templateId", label: "Template id", type: "text", required: true },
      { key: "action", label: "Action", type: "text", required: true, help: "rename or delete." },
      { key: "newName", label: "New name", type: "text", required: false, help: "Required when action is rename." },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const id = String(values.templateId ?? "").trim();
      if (!id) throw new Error("Provide the template id.");
      const action = String(values.action ?? "").trim().toLowerCase();
      if (action === "delete") {
        onProgress("Deleting template...");
        const r = await deleteSyllabusTemplateAction(id);
        if ("error" in r) throw new Error(r.error);
        return { outputs: {}, summary: { kind: "text", text: `Deleted template ${id}.` } };
      }
      if (action === "rename") {
        const newName = String(values.newName ?? "").trim();
        if (!newName) throw new Error("Provide the new name for the rename.");
        onProgress("Renaming template...");
        const r = await updateSyllabusTemplateAction(id, { name: newName });
        if ("error" in r) throw new Error(r.error);
        return { outputs: {}, summary: { kind: "text", text: `Renamed template to "${newName}".` } };
      }
      throw new Error("Action must be rename or delete.");
    },
  },

  {
    type: "generate-dated-schedule",
    name: "Generate a dated course schedule",
    description: "Generate a week-by-week course schedule anchored to real calendar dates from a term and start date.",
    inputs: [
      { key: "description", label: "Course description", type: "longtext", required: true },
      { key: "startDate", label: "Start date", type: "date", required: true },
      { key: "term", label: "Term", type: "text", required: false, help: "e.g. Fall 2026." },
      { key: "weeks", label: "Number of weeks", type: "number", required: false },
      { key: "tests", label: "Number of tests", type: "number", required: false },
    ],
    outputs: [
      { key: "courseTitle", label: "Course title", type: "text" },
      { key: "scheduleText", label: "Schedule", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const description = String(values.description ?? "").trim();
      if (!description) {
        throw new Error("Provide a course description.");
      }

      const startDate = String(values.startDate ?? "").trim();
      if (!startDate) {
        throw new Error("Provide a start date.");
      }

      const term = String(values.term ?? "").trim();
      const weeksRaw = String(values.weeks ?? "").trim();
      const weeks = weeksRaw ? Number(weeksRaw) : null;
      const testsRaw = String(values.tests ?? "").trim();
      const tests = testsRaw ? Number(testsRaw) : null;

      onProgress("Generating dated schedule...");
      const r = await generateCourseScheduleAction(description, term, startDate, weeks, tests, helpers.provider);
      if ("error" in r) throw new Error(r.error);

      const courseTitle = "";
      const rows = r.rows ?? [];
      const items: string[] = [];
      const lines: string[] = [];

      for (const row of rows) {
        const weekLabel = row.dates ? `Week ${row.week} (${row.dates})` : `Week ${row.week}`;
        const topicStr = row.topics || "(no topics)";
        const line = `${weekLabel} - ${topicStr}`;
        lines.push(line);
        items.push(topicStr || `Week ${row.week}`);
      }

      const scheduleText = lines.join("\n");

      return {
        outputs: { courseTitle, scheduleText },
        summary: { kind: "list", label: `${rows.length}-week schedule`, items },
      };
    },
  },

  {
    type: "generate-schedule-offline",
    name: "Generate a schedule (offline, no AI)",
    description: "Deterministically build a week-by-week schedule (dates, topics, spaced tests) with no model call -- an offline fallback that always runs unattended.",
    inputs: [
      { key: "description", label: "Course description", type: "longtext", required: true },
      { key: "startDate", label: "Start date", type: "date", required: true },
      { key: "weeks", label: "Number of weeks", type: "number", required: true },
      { key: "tests", label: "Number of tests", type: "number", required: false },
    ],
    outputs: [
      { key: "scheduleText", label: "Schedule", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const description = String(values.description ?? "").trim();
      if (!description) {
        throw new Error("Provide a course description.");
      }

      const startDate = String(values.startDate ?? "").trim();
      if (!startDate) {
        throw new Error("Provide a start date.");
      }

      const weeks = Number(values.weeks);
      if (!Number.isInteger(weeks) || weeks < 1) {
        throw new Error("Provide a valid number of weeks (1 or more).");
      }

      const testsRaw = String(values.tests ?? "").trim();
      const tests = testsRaw && Number.isInteger(Number(testsRaw)) ? Number(testsRaw) : 0;

      onProgress("Building schedule...");
      const rows = scaffoldCourseSchedule(description, startDate, weeks, tests);

      const items: string[] = [];
      const lines: string[] = [];

      for (const row of rows) {
        const weekLabel = row.dates ? `Week ${row.week} (${row.dates})` : `Week ${row.week}`;
        const topicStr = row.topics || "(no topic)";
        const assignStr = row.assignment || "(no assignment)";
        const line = `${weekLabel} - ${topicStr} [${assignStr}]`;
        lines.push(line);
        items.push(topicStr);
      }

      const scheduleText = lines.join("\n");

      return {
        outputs: { scheduleText },
        summary: { kind: "list", label: `${rows.length}-week schedule`, items },
      };
    },
  },

  {
    type: "extract-topics-from-repo",
    name: "Extract topics from a repo",
    description: "Mine a repository's contents for a structured list of course topics, to seed schedule or content generation.",
    inputs: [
      { key: "repo", label: "Repository", type: "repo", required: true },
    ],
    outputs: [
      { key: "topics", label: "Topics", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide a repository.");

      onProgress("Reading repository topics...");
      const r = await extractTopicsFromRepoAction(repo, helpers.provider);
      if ("error" in r) throw new Error(r.error);

      return {
        outputs: { topics: r.topics.join("\n") },
        summary: {
          kind: "list",
          label: `${r.topics.length} topic(s)`,
          items: r.topics.length ? r.topics : ["(none found)"],
        },
      };
    },
  },

  {
    type: "generate-module-intro",
    name: "Generate a module introduction",
    description: "Produce a module overview plus key-terms text from the week's objectives, ready to save as a module intro.",
    inputs: [
      {
        key: "objectives",
        label: "Module objectives",
        type: "longtext",
        required: true,
      },
      {
        key: "context",
        label: "Context",
        type: "longtext",
        required: false,
        help: "Optional source material to draw on.",
      },
    ],
    outputs: [
      { key: "intro", label: "Module intro", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const objectives = String(values.objectives ?? "").trim();
      if (!objectives) throw new Error("Provide the module objectives.");
      const context = String(values.context ?? "");

      onProgress("Generating module intro...");
      const r = await generateModuleIntroAction(objectives, context, helpers.provider);
      if ("error" in r) throw new Error(r.error);

      const intro = [r.overview, r.keyTerms ? "Key terms:\n" + r.keyTerms : ""].filter(Boolean).join("\n\n");

      return {
        outputs: { intro },
        summary: { kind: "text", text: intro },
      };
    },
  },

  {
    type: "generate-lesson-plan",
    name: "Generate a lesson plan",
    description: "Generate a lesson plan (slides and talking points) from a module's objectives.",
    inputs: [
      { key: "objectives", label: "Module objectives", type: "longtext", required: true },
      { key: "context", label: "Context", type: "longtext", required: false, help: "Optional source material." },
    ],
    outputs: [
      { key: "lessonPlan", label: "Lesson plan", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const objectives = String(values.objectives ?? "").trim();
      if (!objectives) throw new Error("Provide the module objectives.");
      const context = String(values.context ?? "");

      onProgress("Generating lesson plan...");
      const r = await generateLessonPlanAction(objectives, context, [], undefined, undefined, helpers.provider);
      if ("error" in r) throw new Error(r.error);

      const lines: string[] = [];
      for (const slide of r.slides) {
        lines.push(`${slide.title}\n`);
        for (const bullet of slide.bullets) {
          lines.push(`- ${bullet}`);
        }
        if (slide.code) {
          lines.push(`\n(Code: ${slide.codeLanguage || "code"})\n${slide.code}\n`);
        }
        lines.push("");
      }
      const lessonPlan = lines.join("\n").trim();

      const items = r.slides.map((s) => s.title).length > 0 ? r.slides.map((s) => s.title) : ["(generated)"];

      return {
        outputs: { lessonPlan },
        summary: { kind: "list", label: `Lesson plan (${r.slides.length} slides)`, items },
      };
    },
  },

  {
    type: "generate-worked-examples",
    name: "Generate worked examples",
    description: "Produce worked examples per concept from a module's objectives, for use in a lecture or handout.",
    inputs: [
      {
        key: "objectives",
        label: "Module objectives",
        type: "longtext",
        required: true,
      },
      {
        key: "context",
        label: "Context",
        type: "longtext",
        required: false,
        help: "Optional source material.",
      },
    ],
    outputs: [
      {
        key: "examples",
        label: "Worked examples",
        type: "longtext",
      },
    ],
    run: async (values, helpers, onProgress) => {
      const objectives = String(values.objectives ?? "").trim();
      if (!objectives) {
        throw new Error("Provide the module objectives.");
      }

      const context = String(values.context ?? "");

      onProgress("Generating worked examples...");
      const r = await generateExamplesAction(objectives, context, [], helpers.provider);

      if ("error" in r) {
        throw new Error(r.error);
      }

      const lines: string[] = [];
      lines.push(`Lesson Type: ${r.lessonType}`);
      lines.push("");

      for (const example of r.examples) {
        lines.push(`## ${example.concept}`);
        lines.push(`Title: ${example.title}`);
        lines.push(`${example.content}`);
        lines.push("");
      }

      const examples = lines.join("\n").trim();
      const items = r.examples.map((e) => e.concept).length > 0 ? r.examples.map((e) => e.concept) : ["(generated)"];

      return {
        outputs: { examples },
        summary: { kind: "list", label: "Worked examples", items },
      };
    },
  },

  {
    type: "generate-document",
    name: "Generate a document",
    description: "Generate a handout or document (overview, details, key terms, summary) from a freeform prompt.",
    inputs: [
      {
        key: "prompt",
        label: "What should the document cover?",
        type: "longtext",
        required: true,
      },
    ],
    outputs: [
      { key: "document", label: "Document", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const prompt = String(values.prompt ?? "").trim();
      if (!prompt) {
        throw new Error("Describe the document to generate first.");
      }

      onProgress("Generating document...");
      const r = await generateDocumentTextAction(prompt, helpers.provider);
      if ("error" in r) {
        throw new Error(r.error);
      }

      return {
        outputs: { document: r.text },
        summary: { kind: "text", text: r.text },
      };
    },
  },

  {
    type: "revise-generated-document",
    name: "Revise a document",
    description: "Apply a natural-language edit instruction (replace, retitle, remove a section, add a bullet, shorten) to a generated markdown document.",
    inputs: [
      {
        key: "document",
        label: "Document",
        type: "longtext",
        required: true,
      },
      {
        key: "instruction",
        label: "Edit instruction",
        type: "text",
        required: true,
        help: "e.g. 'remove the Prerequisites section', 'shorten the overview'.",
      },
    ],
    outputs: [
      { key: "document", label: "Revised document", type: "longtext" },
      { key: "applied", label: "Edit applied", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      const document = String(values.document ?? "").trim();
      if (!document) {
        throw new Error("Provide the document to revise.");
      }

      const instruction = String(values.instruction ?? "").trim();
      if (!instruction) {
        throw new Error("Provide the edit instruction.");
      }

      onProgress("Applying edit...");
      const result = applyTextRevision(document, instruction);

      return {
        outputs: {
          document: result.text,
          applied: result.applied ? "1" : "",
        },
        summary: {
          kind: "text",
          text: result.applied ? result.text : "Could not parse that edit instruction; document unchanged.",
        },
      };
    },
  },

  {
    type: "outline-course-from-repo",
    name: "Outline a course from a repo digest",
    description: "Build a week-by-week markdown course outline from a repository digest or file listing (detects technologies, adds a capstone).",
    inputs: [
      {
        key: "digest",
        label: "Repo digest or file listing",
        type: "longtext",
        required: true,
        help: "A repo digest or newline-separated file paths, e.g. from Build a repo digest.",
      },
    ],
    outputs: [
      { key: "outline", label: "Course outline", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const digest = String(values.digest ?? "").trim();
      if (!digest) {
        throw new Error("Provide a repo digest or file listing.");
      }

      onProgress("Building course outline...");

      const lines = digest.split("\n").map((s) => s.trim()).filter(Boolean);
      const fullName = lines[0] || "Repository";
      const paths = lines.slice(1);

      const outline = scaffoldCourseOutline(fullName, paths);

      return {
        outputs: { outline },
        summary: { kind: "text", text: outline },
      };
    },
  },

  {
    type: "extract-glossary-terms",
    name: "Extract glossary terms",
    description: "Pull term and definition pairs out of course material into a glossary.",
    inputs: [
      { key: "text", label: "Source material", type: "longtext", required: true }
    ],
    outputs: [
      { key: "glossary", label: "Glossary", type: "longtext" }
    ],
    run: async (values, helpers, onProgress) => {
      const text = String(values.text ?? "").trim();
      if (!text) {
        throw new Error("Provide the source material to scan.");
      }

      onProgress("Extracting glossary terms...");
      const defs = extractDefinitions(text);

      const items: string[] = [];
      const glossaryLines: string[] = [];
      for (const def of defs) {
        glossaryLines.push(`${def.term}: ${def.definition}`);
        items.push(def.term);
      }
      const glossary = glossaryLines.join("\n");

      return {
        outputs: { glossary },
        summary: {
          kind: "list",
          label: `${defs.length} term(s)`,
          items: items.length ? items : ["(none found)"],
        },
      };
    },
  },

  {
    type: "find-case-study-slide",
    name: "Find a case-study slide",
    description: "Retrieve ready slide material (title, factual bullets, lesson) for the best real case study on a topic, from the curated knowledge base.",
    inputs: [
      { key: "topic", label: "Topic", type: "text", required: true }
    ],
    outputs: [
      { key: "caseStudy", label: "Case study", type: "longtext" },
      { key: "found", label: "Found", type: "boolean" }
    ],
    run: async (values, helpers, onProgress) => {
      const topic = String(values.topic ?? "").trim();
      if (!topic) throw new Error("Provide a topic.");

      onProgress("Finding a case study...");
      const r = await findCaseStudyMaterialAction(topic);
      if ("error" in r) throw new Error(r.error);

      if (!r.material) {
        return {
          outputs: { caseStudy: "", found: "" },
          summary: { kind: "text", text: `No case study found for "${topic}".` }
        };
      }

      const lines: string[] = [r.material.title, ""];
      for (const bullet of r.material.bullets) {
        lines.push(`- ${bullet}`);
      }

      const caseStudy = lines.join("\n").trim();
      return {
        outputs: { caseStudy, found: "1" },
        summary: { kind: "text", text: `Found case study: ${r.material.title}` }
      };
    },
  },

  {
    type: "find-practice-problems",
    name: "Find practice problems",
    description: "Retrieve hand-verified practice problems (example, prompt, solution) for a topic from the curated knowledge base.",
    inputs: [
      { key: "topic", label: "Topic", type: "text", required: true },
      { key: "count", label: "How many", type: "number", required: false, help: "Default 3." }
    ],
    outputs: [
      { key: "problems", label: "Practice problems", type: "longtext" },
      { key: "count", label: "Count", type: "number" }
    ],
    run: async (values, helpers, onProgress) => {
      const topic = String(values.topic ?? "").trim();
      if (!topic) throw new Error("Provide a topic.");

      const countRaw = String(values.count ?? "").trim();
      const limit = countRaw && Number.isInteger(Number(countRaw)) && Number(countRaw) > 0 ? Number(countRaw) : 3;

      onProgress("Finding practice problems...");
      const r = await findPracticeProblemsAction(topic, limit);
      if ("error" in r) throw new Error(r.error);

      const items: string[] = [];
      const lines: string[] = [];

      for (const problem of r.problems) {
        items.push(problem.title);
        lines.push(`[${problem.language}] ${problem.title}`);
        lines.push("");
        lines.push("Prompt:");
        lines.push(problem.prompt);
        lines.push("");
        lines.push("Example:");
        lines.push(problem.exampleCode);
        lines.push("");
        lines.push("Solution:");
        lines.push(problem.solutionCode);
        lines.push("");
        lines.push("---");
        lines.push("");
      }

      const problems = lines.join("\n").trim();
      return {
        outputs: { problems, count: r.problems.length },
        summary: { kind: "list", label: `${r.problems.length} problem(s)`, items: items.length ? items : ["(none found)"] }
      };
    },
  },

  {
    type: "research-topic",
    name: "Research a topic",
    description: "Fetch external, cited research (case studies and practice material) for a topic, to seed lecture or assignment content.",
    inputs: [
      { key: "topic", label: "Topic", type: "text", required: true },
      { key: "count", label: "How many results", type: "number", required: false, help: "Default 5." }
    ],
    outputs: [
      { key: "results", label: "Research results", type: "longtext" }
    ],
    run: async (values, helpers, onProgress) => {
      const topic = String(values.topic ?? "").trim();
      if (!topic) throw new Error("Provide a topic.");

      const countRaw = String(values.count ?? "").trim();
      const limit = countRaw && Number.isInteger(Number(countRaw)) && Number(countRaw) > 0 ? Number(countRaw) : 5;

      onProgress("Researching...");
      const r = await researchTopicAction(topic, limit);
      if ("error" in r) throw new Error(r.error);

      const items: string[] = [];
      const lines: string[] = [];

      for (const result of r.results) {
        items.push(result.title);
        lines.push(result.title);
        lines.push(`Source: ${result.source}`);
        if (result.url) {
          lines.push(`URL: ${result.url}`);
        }
        lines.push("");
        lines.push(result.summary);
        lines.push("");
        lines.push("---");
        lines.push("");
      }

      const results = lines.join("\n").trim();
      return {
        outputs: { results },
        summary: { kind: "list", label: `${r.results.length} result(s)`, items: r.results.length ? items : ["(none found)"] }
      };
    },
  },

  {
    type: "generate-slides-standalone",
    name: "Generate slides",
    description: "Generate a single lecture deck (title and slides) from a prompt. Emits the slides as JSON so a later step can revise them.",
    inputs: [
      { key: "prompt", label: "What should the deck cover?", type: "longtext", required: true }
    ],
    outputs: [
      { key: "presentationTitle", label: "Presentation title", type: "text" },
      { key: "deck", label: "Deck (readable)", type: "longtext" },
      { key: "slidesJson", label: "Slides (JSON)", type: "longtext" }
    ],
    run: async (values, helpers, onProgress) => {
      const prompt = String(values.prompt ?? "").trim();
      if (!prompt) throw new Error("Describe the slides to generate first.");

      onProgress("Generating slides...");
      const r = await generateSlidesAction(prompt, helpers.provider);
      if ("error" in r) throw new Error(r.error);

      const deckLines: string[] = [r.presentationTitle];
      for (const slide of r.slides) {
        deckLines.push(`\n## ${slide.title}`);
        for (const bullet of slide.bullets) {
          deckLines.push(`- ${bullet}`);
        }
      }
      const deck = deckLines.join("\n");

      const slidesJson = JSON.stringify(r.slides);
      const titles = r.slides.map((s) => s.title);

      return {
        outputs: { presentationTitle: r.presentationTitle, deck, slidesJson },
        summary: { kind: "list", label: r.presentationTitle, items: titles.length ? titles : ["(no slides)"] }
      };
    },
  },

  {
    type: "generate-lecture-script",
    name: "Generate a lecture script",
    description: "Write a spoken lecture script for a topic and objectives, to feed narration or an avatar video.",
    inputs: [
      { key: "topic", label: "Topic", type: "text", required: true },
      { key: "objectives", label: "Objectives", type: "longtext", required: true },
      { key: "minutes", label: "Target minutes", type: "number", required: false, help: "Default 50." }
    ],
    outputs: [
      { key: "script", label: "Lecture script", type: "longtext" }
    ],
    run: async (values, helpers, onProgress) => {
      const topic = String(values.topic ?? "").trim();
      if (!topic) throw new Error("Provide a topic.");
      const objectives = String(values.objectives ?? "").trim();
      if (!objectives) throw new Error("Provide the objectives.");
      const minutesRaw = String(values.minutes ?? "").trim();
      const minutes = minutesRaw && Number.isFinite(Number(minutesRaw)) && Number(minutesRaw) > 0 ? Number(minutesRaw) : 50;
      onProgress("Writing lecture script...");
      const r = await generateLectureScriptAction(topic, objectives, minutes, helpers.provider);
      if ("error" in r) throw new Error(r.error);
      return { outputs: { script: r.script }, summary: { kind: "text", text: r.script } };
    },
  },

  {
    type: "revise-generated-slides",
    name: "Revise slides",
    description: "Apply an edit instruction (rename, remove, add a slide, trim bullets) to a deck's slides. Takes the slides JSON emitted by Generate slides.",
    inputs: [
      {
        key: "presentationTitle",
        label: "Presentation title",
        type: "text",
        required: true,
      },
      {
        key: "slidesJson",
        label: "Slides (JSON)",
        type: "longtext",
        required: true,
        help: "Slides JSON, e.g. wired from Generate slides.",
      },
      {
        key: "instruction",
        label: "Edit instruction",
        type: "text",
        required: true,
      },
    ],
    outputs: [
      {
        key: "slidesJson",
        label: "Revised slides (JSON)",
        type: "longtext",
      },
      {
        key: "deck",
        label: "Deck (readable)",
        type: "longtext",
      },
    ],
    run: async (values, helpers, onProgress) => {
      const title = String(values.presentationTitle ?? "").trim();
      if (!title) throw new Error("Provide the presentation title.");
      const instruction = String(values.instruction ?? "").trim();
      if (!instruction) throw new Error("Provide the edit instruction.");
      const raw = String(values.slidesJson ?? "").trim();
      if (!raw) throw new Error("Provide the slides JSON (wire it from Generate slides).");
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("The slides JSON is not valid JSON.");
      }
      if (!Array.isArray(parsed)) throw new Error("The slides JSON must be an array of slides.");
      const currentSlides = parsed as SlideData[];
      onProgress("Revising slides...");
      const r = await reviseLectureSlidesAction(title, currentSlides, instruction, helpers.provider);
      if ("error" in r) throw new Error(r.error);
      const deckLines: string[] = [`# ${title}`];
      for (const slide of r.slides) {
        deckLines.push(`\n## ${slide.title}`);
        for (const bullet of slide.bullets) {
          deckLines.push(`- ${bullet}`);
        }
      }
      const deck = deckLines.join("\n");
      return {
        outputs: {
          slidesJson: JSON.stringify(r.slides),
          deck,
        },
        summary: {
          kind: "list",
          label: title,
          items: r.slides.map((s) => s.title),
        },
      };
    },
  },

  {
    type: "extract-pptx-slides",
    name: "Extract slides from a PowerPoint",
    description: "Read the slide text out of an uploaded .pptx deck, to feed narration or Q&A. Attended-only (needs an uploaded file).",
    inputs: [
      {
        key: "deck",
        label: "PowerPoint file",
        type: "uploads",
        required: true,
        accept: ".pptx",
      },
    ],
    outputs: [
      { key: "slides", label: "Slides", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const files = values.deck as File[] | undefined;
      if (!files || files.length === 0) {
        throw new Error("Upload a .pptx file.");
      }

      const file = files[0];
      onProgress("Reading slides...");

      // Convert the File to base64 (browser-safe, chunked to avoid call-stack limits)
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }
      const base64 = btoa(binary);

      const r = await extractPptxSlidesAction(base64);
      if ("error" in r) throw new Error(r.error);

      // Build a readable slides text: one block per slide
      const slidesLines: string[] = [];
      for (const s of r.slides) {
        slidesLines.push(`Slide ${s.slide}: ${s.title}`);
        if (s.text) {
          slidesLines.push(s.text);
        }
        slidesLines.push("");
      }
      const slides = slidesLines.join("\n");

      // Build items list for summary
      const items = r.slides.length > 0
        ? r.slides.map((s) => `Slide ${s.slide}: ${s.title}`)
        : ["(empty)"];

      return {
        outputs: { slides },
        summary: {
          kind: "list",
          label: `${r.slides.length} slide(s)`,
          items,
        },
      };
    },
  },

  {
    type: "synthesize-narration",
    name: "Synthesize narration audio",
    description: "Turn a script into narration audio with the in-house voice, and save it to a course's materials.",
    inputs: [
      {
        key: "text",
        label: "Script",
        type: "longtext",
        required: true,
      },
      {
        key: "voiceId",
        label: "Voice id",
        type: "text",
        required: false,
        help: "Optional - overrides the default voice.",
      },
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: false,
        help: "Save the audio to this course's materials.",
      },
      {
        key: "fileName",
        label: "File name",
        type: "text",
        required: false,
        help: "Defaults to narration.mp3.",
      },
    ],
    outputs: [
      { key: "saved", label: "Saved", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      const text = String(values.text ?? "").trim();
      if (!text) throw new Error("Provide the script to synthesize.");
      const voiceId = String(values.voiceId ?? "").trim() || undefined;
      onProgress("Synthesizing narration...");
      const r = await synthesizeNarrationAction(text, voiceId);
      if ("error" in r) throw new Error(r.error);
      const blob = base64ToBlob(r.base64, r.mimeType);
      const hubCourse = String(values.hubCourse ?? "").trim();
      const fileName = String(values.fileName ?? "").trim() || "narration.mp3";
      if (hubCourse && helpers.saveCourseMaterialFile) {
        await helpers.saveCourseMaterialFile(hubCourse, blob, fileName);
        return {
          outputs: { saved: "1" },
          summary: {
            kind: "text",
            text: `Saved ${fileName} to the course materials.`,
          },
        };
      }
      return {
        outputs: { saved: "" },
        summary: {
          kind: "text",
          text: `Generated narration audio (${Math.round(blob.size / 1024)} KB). Select a course tile to save it.`,
        },
      };
    },
  },

  {
    type: "generate-avatar-video",
    name: "Generate an avatar video",
    description: "Start an in-house avatar (talking-head) lecture-video render from a script. Emits a video id for a later poll step.",
    inputs: [
      {
        key: "script",
        label: "Script",
        type: "longtext",
        required: true,
      },
    ],
    outputs: [
      { key: "videoId", label: "Video id", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const script = String(values.script ?? "").trim();
      if (!script) throw new Error("Provide the script to render.");
      onProgress("Starting avatar render...");
      const r = await generateAvatarVideoAction(script);
      if ("error" in r) throw new Error(r.error);
      return {
        outputs: { videoId: r.videoId },
        summary: {
          kind: "text",
          text: `Avatar render started (id ${r.videoId}). Use Poll avatar video to fetch it when ready.`,
        },
      };
    },
  },

  {
    type: "poll-avatar-video",
    name: "Poll an avatar video",
    description: "Check an avatar video render's status and return its download URL when ready.",
    inputs: [
      {
        key: "videoId",
        label: "Video id",
        type: "text",
        required: true,
        help: "The id from Generate an avatar video.",
      },
    ],
    outputs: [
      { key: "status", label: "Status", type: "text" },
      { key: "videoUrl", label: "Video URL", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const videoId = String(values.videoId ?? "").trim();
      if (!videoId) throw new Error("Provide the video id.");
      onProgress("Checking render status...");
      const r = await getAvatarVideoStatusAction(videoId);
      if ("error" in r) throw new Error(r.error);
      const url = r.videoUrl ?? "";
      if (url) {
        return {
          outputs: { status: r.status, videoUrl: url },
          summary: { kind: "link", label: `Render ${r.status}`, url },
        };
      }
      return {
        outputs: { status: r.status, videoUrl: url },
        summary: { kind: "text", text: `Render status: ${r.status}` },
      };
    },
  },

  {
    type: "generate-assignment-brief",
    name: "Generate an assignment",
    description: "Draft a structured assignment (overview, steps, deliverables) from a module's objectives.",
    inputs: [
      { key: "objectives", label: "Module objectives", type: "longtext", required: true },
      { key: "context", label: "Context", type: "longtext", required: false, help: "Optional source material." },
    ],
    outputs: [
      { key: "assignment", label: "Assignment", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const objectives = String(values.objectives ?? "").trim();
      if (!objectives) throw new Error("Provide the module objectives.");
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

  {
    type: "get-assignment-sync-state",
    name: "Check assignment/repo sync",
    description: "Compare an LMS assignment against its repo file and report whether they are in sync.",
    inputs: [
      { key: "assignmentUrl", label: "Assignment URL", type: "text", required: true },
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "path", label: "File path in repo", type: "text", required: true, help: "e.g. week01/README.md" },
      { key: "institution", label: "Institution", type: "institution", required: false },
      { key: "branch", label: "Branch", type: "text", required: false },
    ],
    outputs: [
      { key: "inSync", label: "In sync", type: "boolean" },
      { key: "diff", label: "Difference", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const assignmentUrl = String(values.assignmentUrl ?? "").trim();
      if (!assignmentUrl) throw new Error("Provide the assignment URL.");
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide the repository.");
      const path = String(values.path ?? "").trim();
      if (!path) throw new Error("Provide the file path in the repo.");
      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;
      const branch = String(values.branch ?? "").trim() || undefined;

      onProgress("Comparing assignment and repo...");
      const r = await getAssignmentSyncStateAction(assignmentUrl, repo, path, inst, branch);
      if ("error" in r) throw new Error(r.error);

      const isSync = r.repoMarkdown !== null && r.repoMarkdown === r.canvasMarkdown;
      const inSyncOutput = isSync ? "1" : "";

      let diffText: string;
      if (r.repoMarkdown === null) {
        diffText = "Repo file does not exist.\n\nCanvas assignment markdown:\n" + r.canvasMarkdown;
      } else if (isSync) {
        diffText = "No differences.";
      } else {
        diffText = "Canvas:\n" + r.canvasMarkdown + "\n\n---\n\nRepo file:\n" + r.repoMarkdown;
      }

      const summaryText = isSync
        ? "In sync."
        : r.repoMarkdown === null
          ? "Repo file does not exist."
          : "Content differs between Canvas and repo file.";

      return {
        outputs: { inSync: inSyncOutput, diff: diffText },
        summary: { kind: "text", text: summaryText },
      };
    },
  },

  {
    type: "sync-assignment-to-repo",
    name: "Push assignment into the repo",
    description: "Write an LMS assignment's content into the repo file (README). Attended-only.",
    inputs: [
      { key: "assignmentUrl", label: "Assignment URL", type: "text", required: true },
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "path", label: "File path in repo", type: "text", required: true, help: "e.g. week01/README.md" },
      { key: "institution", label: "Institution", type: "institution", required: false },
      { key: "branch", label: "Branch", type: "text", required: false },
    ],
    outputs: [
      { key: "path", label: "Committed path", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const assignmentUrl = String(values.assignmentUrl ?? "").trim();
      if (!assignmentUrl) throw new Error("Provide the assignment URL.");
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide the repository.");
      const path = String(values.path ?? "").trim();
      if (!path) throw new Error("Provide the file path in the repo.");
      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;
      const branch = String(values.branch ?? "").trim() || undefined;

      onProgress("Syncing assignment to the repo...");
      const r = await syncAssignmentToRepoAction(assignmentUrl, repo, path, inst, branch);
      if ("error" in r) throw new Error(r.error);

      return {
        outputs: { path: r.path },
        summary: { kind: "text", text: `Wrote the assignment to ${r.path}.` },
      };
    },
  },

  {
    type: "sync-assignment-from-repo",
    name: "Update assignment from the repo",
    description: "Update an LMS assignment's description from the repo file (README). Attended-only.",
    inputs: [
      { key: "assignmentUrl", label: "Assignment URL", type: "text", required: true },
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "path", label: "File path in repo", type: "text", required: true, help: "e.g. week01/README.md" },
      { key: "institution", label: "Institution", type: "institution", required: false },
      { key: "branch", label: "Branch", type: "text", required: false },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const assignmentUrl = String(values.assignmentUrl ?? "").trim();
      if (!assignmentUrl) throw new Error("Provide the assignment URL.");
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide the repository.");
      const path = String(values.path ?? "").trim();
      if (!path) throw new Error("Provide the file path in the repo.");
      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;
      const branch = String(values.branch ?? "").trim() || undefined;

      onProgress("Updating the assignment from the repo...");
      const r = await syncAssignmentFromRepoAction(assignmentUrl, repo, path, inst, branch);
      if ("error" in r) throw new Error(r.error);

      return {
        outputs: {},
        summary: { kind: "text", text: "Updated the assignment from the repo file." },
      };
    },
  },

  {
    type: "generate-quiz-from-material",
    name: "Generate a quiz from material",
    description: "Generate cloze and multiple-choice questions (with a verbatim answer key) from the instructor's own material. Emits the questions as JSON for an LMS import step.",
    inputs: [
      { key: "material", label: "Source material", type: "longtext", required: true },
      { key: "count", label: "How many questions", type: "number", required: false, help: "Default 5." },
    ],
    outputs: [
      { key: "quiz", label: "Quiz (with answer key)", type: "longtext" },
      { key: "questionsJson", label: "Questions (JSON)", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const material = String(values.material ?? "").trim();
      if (!material) throw new Error("Provide the source material.");
      const countRaw = String(values.count ?? "").trim();
      const count = countRaw && Number.isInteger(Number(countRaw)) && Number(countRaw) > 0 ? Number(countRaw) : 5;

      onProgress("Generating quiz...");
      const questions = scaffoldQuizQuestions(material, count);
      const quiz = renderQuizText(questions);

      return {
        outputs: { quiz, questionsJson: JSON.stringify(questions) },
        summary: { kind: "text", text: quiz || "(no questions could be generated from this material)" },
      };
    },
  },

  {
    type: "import-quiz-questions",
    name: "Import questions into a quiz",
    description: "Create quiz questions in a Canvas quiz from a generated question set (JSON from Generate a quiz). Attended-only.",
    inputs: [
      { key: "course", label: "LMS course", type: "lmsCourse", required: true },
      { key: "quizId", label: "Quiz id", type: "text", required: true, help: "The numeric Canvas quiz id." },
      { key: "questionsJson", label: "Questions (JSON)", type: "longtext", required: true, help: "Wired from Generate a quiz from material." },
      { key: "institution", label: "Institution", type: "institution", required: false },
    ],
    outputs: [
      { key: "created", label: "Questions created", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      const course = String(values.course ?? "").trim();
      if (!course) throw new Error("Select an LMS course.");

      const quizIdRaw = String(values.quizId ?? "").trim();
      if (!/^\d+$/.test(quizIdRaw)) throw new Error("Provide the numeric quiz id.");
      const quizId = Number(quizIdRaw);

      const raw = String(values.questionsJson ?? "").trim();
      if (!raw) throw new Error("Provide the questions JSON (wire it from Generate a quiz from material).");

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("The questions JSON is not valid JSON.");
      }

      if (!Array.isArray(parsed)) throw new Error("The questions JSON must be an array.");

      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;

      onProgress("Creating quiz questions...");
      let created = 0;
      const failures: string[] = [];

      for (let i = 0; i < parsed.length; i++) {
        const q = parsed[i] as { type?: string; prompt?: string; answer?: string; choices?: string[] };
        const prompt = String(q.prompt ?? "");
        const answer = String(q.answer ?? "");
        const question = (q.type === "multiple_choice" && Array.isArray(q.choices))
          ? { name: `Question ${i + 1}`, text: prompt, type: "multiple_choice_question" as const, points: 1, answers: q.choices.map((c) => ({ text: String(c), correct: String(c) === answer })) }
          : { name: `Question ${i + 1}`, text: prompt, type: "short_answer_question" as const, points: 1, answers: [{ text: answer, correct: true }] };
        const r = await createQuizQuestionAction(course, quizId, question, inst);
        if ("error" in r) {
          failures.push(`Question ${i + 1}: ${r.error}`);
        } else {
          created++;
        }
      }

      const items = failures.length ? failures : [`Created ${created} question(s).`];
      return { outputs: { created }, summary: { kind: "list", label: `Created ${created} of ${parsed.length} question(s)`, items } };
    },
  },

  {
    type: "generate-rubric-offline",
    name: "Generate a rubric (offline, no AI)",
    description: "Build a tiered weighted grading rubric from an assignment's instructions with no model call -- a fallback rubric source.",
    inputs: [
      { key: "instructions", label: "Assignment instructions", type: "longtext", required: true },
    ],
    outputs: [
      { key: "rubric", label: "Rubric", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const instructions = String(values.instructions ?? "").trim();
      if (!instructions) {
        throw new Error("Provide the assignment instructions.");
      }

      onProgress("Building rubric...");
      const rubric = generateEmbeddedRubricText(instructions);

      return {
        outputs: { rubric },
        summary: { kind: "text", text: rubric },
      };
    },
  },

  {
    type: "generate-rubric-from-repo",
    name: "Generate a rubric from a repo",
    description: "Generate a grading rubric from a repository's contents.",
    inputs: [
      { key: "repo", label: "Repository", type: "repo", required: true },
    ],
    outputs: [
      { key: "rubric", label: "Rubric", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) {
        throw new Error("Provide a repository.");
      }

      onProgress("Downloading repository...");
      const z = await getRepoZipAction(repo);
      if ("error" in z) {
        throw new Error(z.error);
      }

      onProgress("Generating rubric...");
      const r = await generateCourseRubricFromZipAction(z.base64, helpers.provider);
      if (typeof r !== "string") {
        throw new Error(r.error);
      }

      return {
        outputs: { rubric: r },
        summary: { kind: "text", text: r },
      };
    },
  },

  {
    type: "remember-rubric",
    name: "Bank a rubric for reuse",
    description: "Save a rubric with its assignment topic so it can be reused for similar assignments later.",
    inputs: [
      { key: "rubric", label: "Rubric", type: "longtext", required: true },
      { key: "topic", label: "Topic", type: "text", required: true },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const rubric = String(values.rubric ?? "").trim();
      if (!rubric) throw new Error("Provide the rubric to bank.");
      const topic = String(values.topic ?? "").trim();
      if (!topic) throw new Error("Provide the assignment topic.");
      onProgress("Banking rubric...");
      const r = await rememberRubricAction(rubric, topic);
      if ("error" in r) throw new Error(r.error);
      return { outputs: {}, summary: { kind: "text", text: `Banked a rubric for "${topic}".` } };
    },
  },

  {
    type: "find-banked-rubric",
    name: "Find a banked rubric",
    description: "Retrieve a previously banked rubric for a matching topic, to reuse before generating a new one.",
    inputs: [
      { key: "topic", label: "Topic", type: "text", required: true },
    ],
    outputs: [
      { key: "rubric", label: "Rubric", type: "longtext" },
      { key: "matched", label: "Matched", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      const topic = String(values.topic ?? "").trim();
      if (!topic) throw new Error("Provide a topic.");
      onProgress("Looking up a banked rubric...");
      const r = await findBankedRubricAction(topic);
      if ("error" in r) throw new Error(r.error);
      return {
        outputs: { rubric: r.rubric, matched: r.matched ? "1" : "" },
        summary: { kind: "text", text: r.matched ? r.rubric : `No banked rubric found for "${topic}".` },
      };
    },
  },

  {
    type: "bulk-associate-rubric",
    name: "Attach a rubric to assignments",
    description: "Associate one rubric with many assignments across a course at once. Attended-only.",
    inputs: [
      { key: "course", label: "LMS course", type: "lmsCourse", required: true },
      { key: "rubricId", label: "Rubric id", type: "text", required: true, help: "The numeric Canvas rubric id." },
      { key: "assignmentIds", label: "Assignment ids", type: "longtext", required: true, help: "One assignment id per line." },
      { key: "institution", label: "Institution", type: "institution", required: false },
    ],
    outputs: [
      { key: "succeeded", label: "Succeeded", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      const course = String(values.course ?? "").trim();
      if (!course) {
        throw new Error("Select an LMS course.");
      }

      const rubricIdRaw = String(values.rubricId ?? "").trim();
      if (!/^\d+$/.test(rubricIdRaw)) {
        throw new Error("Provide the numeric rubric id.");
      }
      const rubricId = Number(rubricIdRaw);

      const ids = String(values.assignmentIds ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
      if (ids.length === 0) {
        throw new Error("Provide at least one assignment id.");
      }

      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;

      onProgress("Associating rubric...");
      const r = await bulkAssociateRubricAction(course, rubricId, ids, inst);
      if ("error" in r) {
        throw new Error(r.error);
      }

      const succeeded = r.updated;
      return {
        outputs: { succeeded },
        summary: { kind: "text", text: `Associated the rubric with ${succeeded} assignment(s).` },
      };
    },
  },

  {
    type: "discard-grading-draft",
    name: "Discard a grading draft",
    description: "Delete a pending grading draft during review triage. Attended-only.",
    inputs: [
      { key: "draftId", label: "Draft id", type: "text", required: true },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const draftId = String(values.draftId ?? "").trim();
      if (!draftId) {
        throw new Error("Provide the grading draft id.");
      }

      onProgress("Discarding draft...");
      const r = await deleteGradingDraftAction(draftId);
      if ("error" in r) {
        throw new Error(r.error);
      }

      return {
        outputs: {},
        summary: { kind: "text", text: `Discarded grading draft ${draftId}.` },
      };
    },
  },

  {
    type: "generate-model-answer",
    name: "Generate a model answer",
    description: "Write a full-credit model answer for an assignment against its rubric, as an instructor reference.",
    inputs: [
      { key: "instructions", label: "Assignment instructions", type: "longtext", required: true },
      { key: "rubric", label: "Rubric", type: "longtext", required: false },
    ],
    outputs: [
      { key: "modelAnswer", label: "Model answer", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const instructions = String(values.instructions ?? "").trim();
      if (!instructions) {
        throw new Error("Provide the assignment instructions.");
      }

      const rubric = String(values.rubric ?? "");
      onProgress("Writing model answer...");
      const r = await generateModelAnswerAction(instructions, rubric, helpers.provider);
      if ("error" in r) {
        throw new Error(r.error);
      }

      return {
        outputs: { modelAnswer: r.modelAnswer },
        summary: { kind: "text", text: r.modelAnswer },
      };
    },
  },

  {
    type: "grade-repo",
    name: "Grade a repository",
    description: "AI-grade a single student repository against a rubric. Produces a score and feedback (does not post to the LMS).",
    inputs: [
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "instructions", label: "Assignment instructions", type: "longtext", required: true },
      { key: "rubric", label: "Rubric", type: "longtext", required: false },
      { key: "branch", label: "Branch", type: "text", required: false },
    ],
    outputs: [
      { key: "gradeSummary", label: "Grade and feedback", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) {
        throw new Error("Provide a repository.");
      }

      const instructions = String(values.instructions ?? "").trim();
      if (!instructions) {
        throw new Error("Provide the assignment instructions.");
      }

      const rubric = String(values.rubric ?? "");
      const branch = String(values.branch ?? "").trim() || undefined;

      onProgress("Grading repository...");
      const r = await gradeRepoAction(repo, instructions, rubric, helpers.provider, branch);
      if ("error" in r) {
        throw new Error(r.error);
      }

      const summaryLines: string[] = [];
      summaryLines.push(r.fullName);
      summaryLines.push("");

      for (const result of r.run.results) {
        summaryLines.push(`Student: ${result.student}`);
        if (result.totalScore) {
          summaryLines.push(`Total Score: ${result.totalScore}`);
        }
        for (const area of result.rubricAreas) {
          if (area.score) {
            summaryLines.push(`${area.area}: ${area.score}`);
          }
        }
        if (result.overallComment) {
          summaryLines.push(`Feedback: ${result.overallComment}`);
        }
        summaryLines.push("");
      }

      const gradeSummary = summaryLines.join("\n").trim();

      return {
        outputs: { gradeSummary },
        summary: { kind: "text", text: gradeSummary },
      };
    },
  },

  {
    type: "grade-one-submission",
    name: "Grade one submission",
    description: "AI-score a single submission's code against a rubric (finer-grained than the batch grader). Good for regrades and appeals. Scoring only; does not post.",
    inputs: [
      { key: "code", label: "Submission code/text", type: "longtext", required: true },
      { key: "courseId", label: "Course id", type: "text", required: true },
      { key: "assignmentId", label: "Assignment id", type: "text", required: true },
      { key: "userId", label: "Student user id", type: "text", required: true, help: "The numeric Canvas user id." },
    ],
    outputs: [
      { key: "gradeSummary", label: "Grade and feedback", type: "longtext" },
      { key: "canvasUrl", label: "Submission URL", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const code = String(values.code ?? "").trim();
      if (!code) {
        throw new Error("Provide the submission code or text.");
      }

      const courseId = String(values.courseId ?? "").trim();
      if (!courseId) {
        throw new Error("Provide the course id.");
      }

      const assignmentId = String(values.assignmentId ?? "").trim();
      if (!assignmentId) {
        throw new Error("Provide the assignment id.");
      }

      const userIdRaw = String(values.userId ?? "").trim();
      if (!/^\d+$/.test(userIdRaw)) {
        throw new Error("Provide the numeric student user id.");
      }

      onProgress("Grading submission...");
      const r = await gradeOneSubmissionAction(code, courseId, assignmentId, Number(userIdRaw), helpers.provider);
      if ("error" in r) {
        throw new Error(r.error);
      }

      const gradeSummaryLines: string[] = [];
      for (const result of r.run.results) {
        gradeSummaryLines.push(`Student: ${result.student}`);
        if (result.totalScore) {
          gradeSummaryLines.push(`Total Score: ${result.totalScore}`);
        }
        for (const area of result.rubricAreas) {
          gradeSummaryLines.push(`${area.area}: ${area.score}`);
        }
        if (result.overallComment) {
          gradeSummaryLines.push(`Feedback: ${result.overallComment}`);
        }
        gradeSummaryLines.push("");
      }

      const gradeSummary = gradeSummaryLines.join("\n").trim();

      return {
        outputs: { gradeSummary, canvasUrl: r.canvasUrl },
        summary: { kind: "text", text: gradeSummary },
      };
    },
  },
  {
    type: "run-submission-code",
    name: "Run submission code",
    description:
      "Execute a student's submitted code in the sandbox and capture its output as grading evidence.",
    inputs: [
      { key: "code", label: "Code", type: "longtext", required: true },
      {
        key: "fileName",
        label: "File name",
        type: "text",
        required: false,
        help: "Defaults to solution.py; the extension picks the language.",
      },
    ],
    outputs: [{ key: "output", label: "Run output", type: "longtext" }],
    run: async (values, helpers, onProgress) => {
      const code = String(values.code ?? "").trim();
      if (!code) {
        throw new Error("Provide the code to run.");
      }

      const fileName = String(values.fileName ?? "").trim() || "solution.py";
      const dot = fileName.lastIndexOf(".");
      const extension = dot >= 0 ? fileName.slice(dot) : ".py";

      onProgress("Running code...");
      const result = await runSubmissionCodeAction([
        { name: fileName, extension, previewContent: code },
      ]);

      if (!result) {
        throw new Error("The code could not be run.");
      }

      let outputText = "";

      if (result.stdout) {
        outputText += result.stdout;
      }

      if (result.stderr) {
        if (outputText) outputText += "\n";
        outputText += result.stderr;
      }

      if (result.exitCode !== null && result.exitCode !== 0) {
        if (outputText) outputText += "\n";
        outputText += `Exit code: ${result.exitCode}`;
      }

      if (result.compileOutput) {
        if (outputText) outputText += "\n";
        outputText += `Compiler output:\n${result.compileOutput}`;
      }

      if (result.error) {
        if (outputText) outputText += "\n";
        outputText += `Error: ${result.error}`;
      }

      return {
        outputs: { output: outputText },
        summary: { kind: "text", text: outputText || "(No output)" },
      };
    },
  },

  {
    type: "list-ci-artifacts",
    name: "List CI run artifacts",
    description: "List the artifacts (e.g. autograder reports) produced by a repo's CI run, with their download URLs.",
    inputs: [
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "runId", label: "CI run id", type: "text", required: true, help: "The numeric GitHub Actions run id." },
    ],
    outputs: [
      { key: "artifacts", label: "Artifacts", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) {
        throw new Error("Provide a repository.");
      }

      const runIdRaw = String(values.runId ?? "").trim();
      if (!/^\d+$/.test(runIdRaw)) {
        throw new Error("Provide the numeric CI run id.");
      }

      onProgress("Listing artifacts...");
      const r = await listRunArtifactsAction(repo, Number(runIdRaw));
      if ("error" in r) {
        throw new Error(r.error);
      }

      const lines: string[] = [];
      const names: string[] = [];

      for (const artifact of r.artifacts) {
        lines.push(`Name: ${artifact.name}`);
        lines.push(`Size: ${(artifact.sizeInBytes / 1024 / 1024).toFixed(2)} MB`);
        lines.push(`Expired: ${artifact.expired ? "yes" : "no"}`);
        if (artifact.expiresAt) {
          lines.push(`Expires: ${artifact.expiresAt}`);
        }
        if (artifact.createdAt) {
          lines.push(`Created: ${artifact.createdAt}`);
        }
        lines.push("");
        names.push(artifact.name);
      }

      const artifactsText = lines.join("\n").trim();

      return {
        outputs: { artifacts: artifactsText },
        summary: { kind: "list", label: `${r.artifacts.length} artifact(s)`, items: r.artifacts.length ? names : ["(none)"] },
      };
    },
  },

  {
    type: "remediate-office-file",
    name: "Remediate a course Office file",
    description: "Auto-fix accessibility issues (alt text, headings, title) in a course docx or pptx file and save it back. Attended-only.",
    inputs: [
      { key: "course", label: "LMS course", type: "lmsCourse", required: true },
      { key: "fileId", label: "File id", type: "text", required: true, help: "The numeric Canvas file id." },
      { key: "institution", label: "Institution", type: "institution", required: false },
    ],
    outputs: [
      { key: "issuesAddressed", label: "Issues addressed", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      const course = String(values.course ?? "").trim();
      if (!course) {
        throw new Error("Select an LMS course.");
      }

      const fileIdRaw = String(values.fileId ?? "").trim();
      if (!/^\d+$/.test(fileIdRaw)) {
        throw new Error("Provide the numeric file id.");
      }

      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;

      onProgress("Remediating file...");
      const r = await autoFixOfficeFileAction(course, Number(fileIdRaw), inst, helpers.provider);
      if ("error" in r) {
        throw new Error(r.error);
      }

      return {
        outputs: { issuesAddressed: r.issues.length },
        summary: { kind: "text", text: `Remediated the file (${r.issues.length} accessibility issue(s) addressed).` },
      };
    },
  },

  {
    type: "check-broken-links",
    name: "Check for broken links",
    description: "Run and read Canvas link validation for a course, returning any broken links. Set Kick off to start a fresh scan (results appear on a later run).",
    inputs: [
      { key: "course", label: "LMS course", type: "lmsCourse", required: true },
      { key: "kickoff", label: "Kick off a fresh scan", type: "boolean", required: false },
      { key: "institution", label: "Institution", type: "institution", required: false },
    ],
    outputs: [
      { key: "brokenLinks", label: "Broken links", type: "longtext" },
      { key: "state", label: "Scan state", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const course = String(values.course ?? "").trim();
      if (!course) {
        throw new Error("Select an LMS course.");
      }

      const kickoff = String(values.kickoff ?? "") === "1";
      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;

      onProgress(kickoff ? "Starting link validation..." : "Reading link validation...");
      const r = await checkBrokenLinksAction(course, inst, kickoff);
      if ("error" in r) {
        throw new Error(r.error);
      }

      const lines: string[] = [];
      const urls: string[] = [];
      for (const link of r.links) {
        lines.push(`${link.itemType}: ${link.itemTitle}`);
        lines.push(`URL: ${link.url}`);
        lines.push(`Reason: ${link.reason}`);
        if (link.linkText) {
          lines.push(`Link text: ${link.linkText}`);
        }
        lines.push("");
        urls.push(link.url);
      }

      const brokenLinks = lines.join("\n").trim();

      return {
        outputs: { brokenLinks, state: r.state },
        summary: {
          kind: "list",
          label: `${r.links.length} broken link(s) (state: ${r.state})`,
          items: r.links.length ? urls : ["(none)"],
        },
      };
    },
  },

  {
    type: "measure-knowledge-gap",
    name: "Measure knowledge coverage",
    description: "Score how well the stored knowledge base covers a topic and list the uncovered terms, as a diagnostic before generating materials.",
    inputs: [
      { key: "topic", label: "Topic", type: "text", required: true }
    ],
    outputs: [
      { key: "coverage", label: "Coverage (0-1)", type: "number" },
      { key: "uncoveredTerms", label: "Uncovered terms", type: "longtext" }
    ],
    run: async (values, helpers, onProgress) => {
      const topic = String(values.topic ?? "").trim();
      if (!topic) throw new Error("Provide a topic.");

      onProgress("Measuring coverage...");
      const r = await measureKnowledgeGapAction(topic);
      if ("error" in r) throw new Error(r.error);

      const rep = r.report;
      const uncovered = rep.uncoveredTerms.join("\n");

      return {
        outputs: { coverage: rep.coverage, uncoveredTerms: uncovered },
        summary: {
          kind: "text",
          text: `Coverage ${(rep.coverage * 100).toFixed(0)}% (gap ${(rep.gap * 100).toFixed(0)}%). Uncovered: ${rep.uncoveredTerms.length ? rep.uncoveredTerms.join(", ") : "none"}.`
        }
      };
    },
  },

  {
    type: "run-research-loop",
    name: "Grow the knowledge base for a topic",
    description: "Retrieve external knowledge for a topic's uncovered terms and store it (unverified) for later review. Ideal as an unattended background-research step.",
    inputs: [
      { key: "topic", label: "Topic", type: "text", required: true }
    ],
    outputs: [
      { key: "learned", label: "Entries learned", type: "number" }
    ],
    run: async (values, helpers, onProgress) => {
      const topic = String(values.topic ?? "").trim();
      if (!topic) throw new Error("Provide a topic.");

      onProgress("Researching and learning...");
      const r = await runResearchLoopAction(topic);
      if ("error" in r) throw new Error(r.error);

      const learnedCount = r.report.stored;
      const rounds = r.report.rounds;

      return {
        outputs: { learned: learnedCount },
        summary: {
          kind: "text",
          text: `Learned ${learnedCount} new entr${learnedCount === 1 ? "y" : "ies"} over ${rounds} round(s) for "${topic}".`
        }
      };
    },
  },

  {
    type: "list-unverified-knowledge",
    name: "List unverified knowledge",
    description: "List knowledge entries the research loop learned but that are awaiting review, so they can be checked before use.",
    inputs: [],
    outputs: [
      { key: "entries", label: "Unverified entries", type: "longtext" },
      { key: "count", label: "Count", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      onProgress("Loading unverified knowledge...");
      const r = await listUnverifiedKnowledgeAction();
      if ("error" in r) throw new Error(r.error);

      const titles = r.entries.map((entry) => entry.title);
      const entriesText = r.entries
        .map((entry) => {
          const topic = Array.isArray(entry.topics) ? entry.topics.join(", ") : entry.topics || "";
          const snippet = entry.summary ? entry.summary.split("\n")[0].slice(0, 60) : "";
          return `${entry.title}\n  Topic: ${topic}\n  Kind: ${entry.kind}\n  Summary: ${snippet}${snippet.length >= 60 ? "..." : ""}`;
        })
        .join("\n\n");

      return {
        outputs: { entries: entriesText, count: r.entries.length },
        summary: {
          kind: "list",
          label: `${r.entries.length} unverified entr${r.entries.length === 1 ? "y" : "ies"}`,
          items: r.entries.length ? titles : ["(none)"],
        },
      };
    },
  },

  {
    type: "generate-copilot-prompt",
    name: "Generate a Copilot agent prompt",
    description: "Draft a GitHub Copilot coding-agent project/scaffolding prompt, ready to feed an agent task.",
    inputs: [
      { key: "schedule", label: "Course schedule", type: "longtext", required: true },
      { key: "fileName", label: "Schedule file name", type: "text", required: false, help: "Defaults to schedule.csv." },
    ],
    outputs: [
      { key: "prompt", label: "Agent prompt", type: "longtext" }
    ],
    run: async (values, helpers, onProgress) => {
      const schedule = String(values.schedule ?? "").trim();
      if (!schedule) throw new Error("Provide course schedule content.");

      const fileName = String(values.fileName ?? "").trim() || "schedule.csv";

      onProgress("Drafting Copilot prompt...");
      const r = await generateCopilotProjectPromptAction(schedule, fileName, helpers.provider);
      if ("error" in r) throw new Error(r.error);

      const promptText = r.prompt;

      return {
        outputs: { prompt: promptText },
        summary: { kind: "text", text: promptText }
      };
    },
  },

  {
    type: "poll-copilot-tasks",
    name: "Check Copilot agent tasks",
    description: "List a repository's Copilot coding-agent tasks with their status and linked pull request, to see whether the agent has finished.",
    inputs: [
      { key: "repo", label: "Repository", type: "repo", required: true },
    ],
    outputs: [
      { key: "tasks", label: "Tasks", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide a repository.");

      onProgress("Checking Copilot tasks...");
      const r = await listCopilotTasksAction(repo);
      if ("error" in r) throw new Error(r.error);

      const titles = r.tasks.map((task) => task.title);
      const tasksText = r.tasks
        .map((task) => {
          const prInfo = task.pr
            ? `PR #${task.pr.number} (${task.pr.state}${task.pr.isDraft ? ", draft" : ""})`
            : "(no PR)";
          return `${task.title}\n  Number: #${task.number}\n  State: ${task.state}\n  PR: ${prInfo}`;
        })
        .join("\n\n");

      return {
        outputs: { tasks: tasksText },
        summary: {
          kind: "list",
          label: `${r.tasks.length} task(s)`,
          items: r.tasks.length ? titles : ["(none)"],
        },
      };
    },
  },

  {
    type: "read-pr-diff",
    name: "Read a pull request diff",
    description: "Read a pull request's changed files and unified diffs, to feed a review or an automated grade.",
    inputs: [
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "prNumber", label: "PR number", type: "text", required: true, help: "The pull request number." },
    ],
    outputs: [
      { key: "diff", label: "Diff", type: "longtext" },
      { key: "files", label: "Changed files", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide a repository.");

      const prRaw = String(values.prNumber ?? "").trim();
      if (!/^\d+$/.test(prRaw)) throw new Error("Provide the numeric PR number.");

      onProgress("Reading PR diff...");
      const r = await listPullRequestFilesAction(repo, Number(prRaw));
      if ("error" in r) throw new Error(r.error);

      const filenames = r.files.map((f) => f.filename);
      const filesText = filenames.join("\n");
      const diffText = r.files
        .map((f) => `${f.filename}\n${f.patch || "(binary or too large)"}`)
        .join("\n\n");

      return {
        outputs: { diff: diffText, files: filesText },
        summary: {
          kind: "list",
          label: `${r.files.length} file(s) changed`,
          items: r.files.length ? filenames : ["(none)"],
        },
      };
    },
  },

  {
    type: "review-pull-request",
    name: "Review a pull request",
    description: "Submit an approve, request-changes, or comment review on a pull request. Attended-only.",
    inputs: [
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "prNumber", label: "PR number", type: "text", required: true },
      { key: "verdict", label: "Verdict", type: "text", required: true, help: "approve, request-changes, or comment." },
      { key: "body", label: "Comment", type: "longtext", required: false },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide a repository.");

      const prRaw = String(values.prNumber ?? "").trim();
      if (!/^\d+$/.test(prRaw)) throw new Error("Provide the numeric PR number.");

      const verdict = String(values.verdict ?? "").trim().toLowerCase();
      const eventMap: Record<string, "APPROVE" | "REQUEST_CHANGES" | "COMMENT"> = {
        "approve": "APPROVE",
        "request-changes": "REQUEST_CHANGES",
        "request_changes": "REQUEST_CHANGES",
        "comment": "COMMENT",
      };
      const event = eventMap[verdict];
      if (!event) throw new Error("Verdict must be approve, request-changes, or comment.");

      const body = String(values.body ?? "");

      onProgress("Submitting review...");
      const r = await reviewPullRequestAction(repo, Number(prRaw), event, body);
      if ("error" in r) throw new Error(r.error);

      return {
        outputs: {},
        summary: { kind: "text", text: `Submitted a ${verdict} review on PR #${prRaw}.` },
      };
    },
  },

  {
    type: "merge-pull-request",
    name: "Merge a pull request",
    description: "Merge a pull request (merge, squash, or rebase). Attended-only.",
    inputs: [
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "prNumber", label: "PR number", type: "text", required: true },
      { key: "method", label: "Merge method", type: "text", required: false, help: "merge (default), squash, or rebase." },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide a repository.");

      const prRaw = String(values.prNumber ?? "").trim();
      if (!/^\d+$/.test(prRaw)) throw new Error("Provide the numeric PR number.");

      const methodRaw = String(values.method ?? "").trim().toLowerCase();
      const method: "merge" | "squash" | "rebase" = methodRaw === "squash" ? "squash" : methodRaw === "rebase" ? "rebase" : "merge";

      onProgress("Merging pull request...");
      const r = await mergePullRequestAction(repo, Number(prRaw), method);
      if ("error" in r) throw new Error(r.error);

      return {
        outputs: {},
        summary: { kind: "text", text: `Merged PR #${prRaw} (${method}).` },
      };
    },
  },

  {
    type: "setup-tests-workflow",
    name: "Install an autograder CI workflow",
    description: "Commit a GitHub Actions autograder tests workflow into a repository. Attended-only.",
    inputs: [
      {
        key: "repo",
        label: "Repository",
        type: "repo",
        required: true,
      },
      {
        key: "branch",
        label: "Branch (optional)",
        type: "text",
        required: false,
      },
      {
        key: "template",
        label: "Test template",
        type: "text",
        required: true,
      },
      {
        key: "customCommand",
        label: "Custom test command (optional)",
        type: "text",
        required: false,
      },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide a repository.");

      const branch = String(values.branch ?? "").trim() || undefined;
      const template = String(values.template ?? "").trim();
      if (!template) throw new Error("Provide a test template.");

      const customCommand = String(values.customCommand ?? "").trim();

      onProgress("Installing tests workflow...");
      const r = await setupTestsWorkflowAction(repo, branch, template, customCommand);
      if ("error" in r) throw new Error(r.error);

      return {
        outputs: {},
        summary: { kind: "text", text: "Autograder CI workflow installed successfully." },
      };
    },
  },

  {
    type: "dispatch-tests",
    name: "Run the autograder tests",
    description: "Trigger the autograder tests workflow for a repository. Emits the run id for a later poll step.",
    inputs: [
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "ref", label: "Branch or ref", type: "text", required: false },
    ],
    outputs: [
      { key: "runId", label: "CI run id", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide a repository.");

      const ref = String(values.ref ?? "").trim() || undefined;

      onProgress("Dispatching tests...");
      const r = await dispatchTestsAction(repo, ref);
      if ("error" in r) throw new Error(r.error);

      return {
        outputs: { runId: String(r.since) },
        summary: { kind: "text", text: `Dispatched tests (run id ${r.since}). Use Poll test run to fetch results.` },
      };
    },
  },

  {
    type: "poll-test-run",
    name: "Poll the autograder run",
    description: "Check the status and pass/fail result of a dispatched autograder run.",
    inputs: [
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "runId", label: "Run id", type: "text", required: true, help: "The run id (timestamp) from Run the autograder tests." },
      { key: "ref", label: "Branch or ref", type: "text", required: false },
    ],
    outputs: [
      { key: "status", label: "Status", type: "text" },
      { key: "results", label: "Results", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide a repository.");

      const runId = String(values.runId ?? "").trim();
      if (!runId) throw new Error("Provide the run id.");

      const ref = String(values.ref ?? "").trim() || undefined;

      onProgress("Checking run status...");
      const r = await getTestRunStatusAction(repo, ref || "main", runId);
      if ("error" in r) throw new Error(r.error);

      const status = r.run?.status || "unknown";
      let resultsText = `Status: ${status}`;
      if (r.run?.conclusion) {
        resultsText += `\nConclusion: ${r.run.conclusion}`;
      }
      if (r.summary) {
        resultsText += `\n\nTest Results:\n`;
        resultsText += `Tests run: ${r.summary.tests}\n`;
        resultsText += `Passed: ${r.summary.passed}\n`;
        resultsText += `Failed: ${r.summary.failures}\n`;
        resultsText += `Errors: ${r.summary.errors}\n`;
        resultsText += `Skipped: ${r.summary.skipped}`;
      }

      return {
        outputs: { status, results: resultsText },
        summary: { kind: "text", text: `Run ${status}${r.summary ? ` - ${r.summary.passed}/${r.summary.tests} tests passed` : ""}` },
      };
    },
  },

  {
    type: "set-branch-protection",
    name: "Protect a branch",
    description: "Lock a repository branch (require reviews, checks, or linear history). Attended-only.",
    inputs: [
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "branch", label: "Branch", type: "text", required: false, help: "Defaults to main." },
      { key: "requirePullRequestReviews", label: "Require pull request reviews", type: "boolean", required: false },
      { key: "requireStatusChecks", label: "Require status checks", type: "boolean", required: false },
      { key: "strictStatusChecks", label: "Require strict status checks", type: "boolean", required: false },
      { key: "enforceAdmins", label: "Enforce for administrators", type: "boolean", required: false },
      { key: "requireLinearHistory", label: "Require linear history", type: "boolean", required: false },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide a repository.");

      const branch = String(values.branch ?? "").trim() || "main";

      const opts = {
        requirePullRequestReviews: String(values.requirePullRequestReviews ?? "") === "1",
        requiredApprovingReviewCount: 1,
        requireStatusChecks: String(values.requireStatusChecks ?? "") === "1",
        statusCheckContexts: [],
        strictStatusChecks: String(values.strictStatusChecks ?? "") === "1",
        enforceAdmins: String(values.enforceAdmins ?? "") === "1",
        requireLinearHistory: String(values.requireLinearHistory ?? "") === "1",
      };

      onProgress("Applying branch protection...");
      const r = await setBranchProtectionAction(repo, branch, opts);
      if ("error" in r) throw new Error(r.error);

      return {
        outputs: {},
        summary: { kind: "text", text: `Protected ${branch} on ${repo}.` },
      };
    },
  },

  {
    type: "tag-repos",
    name: "Tag a repository",
    description: "Set the topics (labels) on a repository to organize it by section or cohort. Attended-only.",
    inputs: [
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "topics", label: "Topics", type: "longtext", required: true, help: "One topic per line (lowercase, hyphenated)." },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide a repository.");
      const topics = String(values.topics ?? "")
        .split("\n")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (topics.length === 0) throw new Error("Provide at least one topic.");

      onProgress("Tagging repository...");
      const r = await setRepoTopicsAction(repo, topics);
      if ("error" in r) throw new Error(r.error);

      return {
        outputs: {},
        summary: { kind: "text", text: `Set ${topics.length} topic(s) on ${repo}.` },
      };
    },
  },

  {
    type: "list-github-repos",
    name: "List GitHub repositories",
    description: "Enumerate the repositories the token can see, to seed a repo selection or fan-out.",
    inputs: [],
    outputs: [
      { key: "repos", label: "Repositories", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      onProgress("Listing repositories...");
      const r = await listGithubReposAction();
      if ("error" in r) throw new Error(r.error);
      const names = r.repos.map((repo) => repo.fullName);
      return {
        outputs: { repos: names.join("\n") },
        summary: {
          kind: "list",
          label: `${r.repos.length} repo(s)`,
          items: names.length ? names : ["(none)"],
        },
      };
    },
  },

  {
    type: "ingest-repo-digest",
    name: "Build a repo digest",
    description: "Build a bounded text digest of a repository's README and source, to feed grading, analysis, or an outline step.",
    inputs: [
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "branch", label: "Branch", type: "text", required: false },
    ],
    outputs: [
      { key: "digest", label: "Repo digest", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide a repository.");
      const branch = String(values.branch ?? "").trim() || undefined;
      onProgress("Building repo digest...");
      const r = await ingestRepoAction(repo, branch);
      if ("error" in r) throw new Error(r.error);
      const digest = r.digest;
      const digestText = [
        `File count: ${digest.fileCount}${digest.truncated ? " (truncated)" : ""}`,
        digest.description,
        "",
        digest.text,
      ].join("\n");
      return {
        outputs: { digest: digestText },
        summary: {
          kind: "text",
          text: `Digest of ${digest.fullName}: ${digest.fileCount} file(s), ${digest.text.length} char(s)`,
        },
      };
    },
  },

  {
    type: "commit-file-to-repo",
    name: "Commit a file to a repo",
    description: "Commit a single file's content to a branch (e.g. push feedback or a solution file). Attended-only.",
    inputs: [
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "path", label: "File path", type: "text", required: true, help: "e.g. feedback/week01.md" },
      { key: "content", label: "File content", type: "longtext", required: true },
      { key: "message", label: "Commit message", type: "text", required: false },
      { key: "branch", label: "Branch", type: "text", required: false, help: "Defaults to main." },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide a repository.");
      const path = String(values.path ?? "").trim();
      if (!path) throw new Error("Provide the file path.");
      const content = String(values.content ?? "");
      if (!content) throw new Error("Provide the file content.");
      const message = String(values.message ?? "").trim() || `Update ${path}`;
      const branch = String(values.branch ?? "").trim() || "main";
      onProgress("Committing file...");
      const r = await commitFileAction(repo, path, content, message, branch);
      if ("error" in r) throw new Error(r.error);
      return { outputs: {}, summary: { kind: "text", text: `Committed ${path} to ${repo} (${branch}).` } };
    },
  },

  {
    type: "detect-repo-frontend",
    name: "Detect a repo's stack",
    description: "Detect a repository's frontend framework and dev command (and backend), to configure a run, preview, or automated build.",
    inputs: [
      { key: "repo", label: "Repository", type: "repo", required: true, help: "As owner/name." },
    ],
    outputs: [
      { key: "framework", label: "Framework", type: "text" },
      { key: "devCommand", label: "Dev command", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide a repository (owner/name).");
      onProgress("Detecting stack...");
      const r = await detectRepoFrontendAction(repo);
      if ("error" in r) throw new Error(r.error);
      const framework = r.frontend?.framework ?? "";
      const devCommand = r.frontend?.devCommand ?? "";

      const summaryParts: string[] = [];
      if (r.frontend) {
        summaryParts.push(`Frontend: ${r.frontend.framework}`);
        summaryParts.push(`Dev command: ${r.frontend.devCommand}`);
      } else {
        summaryParts.push("No frontend detected.");
      }

      if (r.backend) {
        summaryParts.push(`Backend: ${r.backend.framework} (${r.backend.runtime})`);
        summaryParts.push(`Backend dev: ${r.backend.devCommand}`);
      }

      const summaryText = summaryParts.join("\n");
      return { outputs: { framework, devCommand }, summary: { kind: "text", text: summaryText } };
    },
  },

  {
    type: "publish-file-as-page",
    name: "Publish a file as a Canvas page",
    description: "Publish file content (e.g. starter code) into Canvas as a code-block wiki page. Attended-only.",
    inputs: [
      { key: "course", label: "LMS course", type: "lmsCourse", required: true },
      { key: "title", label: "Page title", type: "text", required: true },
      { key: "content", label: "File content", type: "longtext", required: true },
      { key: "filePath", label: "File path/name", type: "text", required: false, help: "Used to label the code block." },
      { key: "published", label: "Publish immediately", type: "boolean", required: false },
      { key: "institution", label: "Institution", type: "institution", required: false },
    ],
    outputs: [
      { key: "pageUrl", label: "Page URL", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const course = String(values.course ?? "").trim();
      if (!course) throw new Error("Select an LMS course.");
      const title = String(values.title ?? "").trim();
      if (!title) throw new Error("Provide a page title.");
      const content = String(values.content ?? "");
      if (!content) throw new Error("Provide the file content.");
      const filePath = String(values.filePath ?? "").trim() || title;
      const published = String(values.published ?? "") === "1";
      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;
      onProgress("Publishing page...");
      const r = await copyFileToCanvasPageAction(course, { filePath, content, title, published }, inst);
      if ("error" in r) throw new Error(r.error);
      return { outputs: { pageUrl: r.htmlUrl }, summary: { kind: "link", label: `Published "${title}"`, url: r.htmlUrl } };
    },
  },
];

export function getStepDefinition(type: string): StepDefinition | undefined {
  return STEP_REGISTRY.find((s) => s.type === type);
}
