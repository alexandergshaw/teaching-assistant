"use server";

import {
  gradeSubmissions,
  gradeCanvasUrl,
  synthesizeFullCreditChecklist,
  generateSampleAnswer,
  extractSubmissions,
  extractStudentEntries,
  extractCanvasEntries,
  generateRubric,
  gradeEntries,
  scaleResultToPoints,
  canvasWorkToEntry,
  type GradingRun,
  type GradingRunEntry,
  type StudentSubmissionEntry,
  type SubmittedFileInfo,
} from "@/lib/grade";
import { runSubmittedCode, type CodeRunResult } from "@/lib/code-runner";
import { parseLenientJsonArray } from "@/lib/lenient-json";
import {
  buildEmbeddedRubric,
  gradeEntriesEmbedded,
  renderRubricText,
  buildDiscussionRubric,
  gradeDiscussion,
  renderDiscussionRubric,
} from "@/lib/embedded-grader";
import { SLIDE_DECK_JSON_SHAPE, SLIDE_STRUCTURE_REQUIREMENTS, slideDeckJsonShapeWith } from "@/lib/slide-prompt";
import { detectMeetingRequestEmbedded } from "@/lib/embedded/meeting";
import { scaffoldModuleIntro, scaffoldAssignment } from "@/lib/embedded/content";
import { scaffoldLessonPlan, scaffoldExamples } from "@/lib/embedded/deck";
import { scaffoldAnnouncement, scaffoldMessageReply, scaffoldStudentNudge } from "@/lib/embedded/communication";
import { scaffoldDocument, scaffoldModuleIntroDoc, scaffoldAssignmentDoc } from "@/lib/embedded/docs";
import { deriveAltTextFromHtml, deriveLinkTextFromHtml } from "@/lib/embedded/accessibility";
import { scaffoldCourseProjectRubric, scaffoldCourseOutline, scaffoldCopilotPrompt } from "@/lib/embedded/course";
import { scaffoldSyllabusFields } from "@/lib/embedded/syllabus";
import { scaffoldCourseSchedule } from "@/lib/embedded/schedule";
import { scaffoldConceptAnimation } from "@/lib/embedded/animation";
import { validateAnimationHtml } from "@/lib/animation-html";
import { copyedit, stripLongDashes } from "@/lib/embedded/scaffold";
import { routeRequest } from "@/lib/embedded/router";
import { rememberRubric, findRubricForTopic } from "@/lib/research/rubric-bank";
import { findCaseStudyMaterial, type CaseStudyMaterial, findPracticeProblems, type PracticeProblemEntry, research, type ResearchResult } from "@/lib/research/index";
import {
  listUnverifiedKnowledge,
  verifyKnowledgeEntry,
  deleteKnowledgeEntry,
  type KnowledgeRow,
} from "@/lib/research/db";
import { measureCoverage, runResearchLoop, type CoverageReport, type ResearchLoopReport } from "@/lib/research/gap";
import { applyTextRevision, applySlidesRevision, applyHtmlRevision } from "@/lib/embedded/revise";
import { detectCanvasUrlKind } from "@/lib/canvas-url";
import {
  fetchCanvasWork,
  canvasWorkToZipBase64,
  fetchCanvasMeta,
  fetchAssignmentPointsPossible,
  getSpeedGraderUrl,
  postCanvasGrades,
  getCourseName,
  getCourseInfo,
  exportCourseCartridge,
  listAnnouncements,
  createAnnouncement,
  listConversations,
  getConversation,
  replyToConversation,
  createConversation,
  listGradingQueue,
  getNeedsGradingCount,
  getUnreadCount,
  getCourseNotifications,
  listCourses,
  listCoursesByTerm,
  setConversationWorkflowState,
  listAssignments,
  listStudents,
  listCourseRoster,
  listAssignmentTextSubmissions,
  listCourseAssignmentDueDates,
  fetchSubmissionDetail,
  listAssignmentNonSubmitters,
  listAssignmentBriefsWithDue,
  listStudentGradeSummaries,
  type CanvasAnnouncement,
  type CanvasConversationSummary,
  type CanvasConversationDetail,
  type CanvasQueueItem,
  type CanvasCourse,
  type CanvasAssignmentBrief,
  type CanvasPerson,
  type CanvasRosterEntry,
  type CanvasSubmissionDetail,
  type CanvasStudentWork,
  type CanvasTextSubmission,
} from "@/lib/canvas";
import { listPreconfiguredInstitutionCodes, resolveInstitution, resolveInstitutionByCode } from "@/lib/canvas-core";
import {
  listModules,
  createModule,
  updateModule,
  deleteModule,
  createModuleItem,
  updateModuleItem,
  deleteModuleItem,
  listPages,
  getPage,
  updatePage,
  createPage,
  createCodeFilePage,
  deletePage,
  listAddableContent,
  setDueDates,
  requestFileUpload,
  listCourseFiles,
  renameCourseFile,
  deleteCourseFile,
  createCourseCopy,
  getMigrationState,
  selectCopyTypes,
  getSelectiveData,
  submitSelectiveImport,
  type SelectiveNode,
  listBulkItems,
  bulkUpdate,
  bulkDelete,
  listRubrics,
  bulkAssociateRubric,
  createRubric,
  getRubric,
  updateRubric,
  type RubricDetail,
  getGradable,
  updateGradable,
  createGradable,
  getFilePreview,
  getOfficeEditable,
  saveOfficeEdits,
  listQuizQuestions,
  createQuizQuestion,
  updateQuizQuestion,
  deleteQuizQuestion,
  type CanvasModule,
  type CanvasPageSummary,
  type CanvasPage,
  type CanvasAddableContent,
  type NewModuleItem,
  type DueDateUpdate,
  type FileUploadTicket,
  type BulkItem,
  type BulkKind,
  type CourseFile,
  type CanvasRubric,
  type GradableKind,
  type GradableDetail,
  type FilePreview,
  type RubricCriterionInput,
  type QuizQuestion,
  type QuizQuestionInput,
  getAccessibilityItem,
  saveAccessibilityItemHtml,
  getOfficeFileImagesWithData,
  getOfficeFileImageData,
  saveOfficeFileImageAlt,
  getOfficeFileStructure,
  saveOfficeFileStructure,
  saveOfficeFileFixes,
  getPdfMeta,
  savePdfFixes,
  uploadFileToModule,
  appendOfficeParagraph,
  listScannableFiles,
  createAssignment,
  listAssignmentGroups,
  type NewAssignment,
  startLinkValidation,
  getLinkValidation,
  type BrokenLink,
} from "@/lib/canvas-modules";
import type { OfficeImage } from "@/lib/office-edit";
import type { OfficeKind, OfficeParagraph, RunSpan } from "@/lib/office-edit";
import { parseOfficeParagraphs, applyOfficeSections } from "@/lib/office-edit";
import { extractTextFromBuffer } from "@/lib/office-extract";
import { suggestHeadingLevels, titleFromFileName } from "@/lib/doc-headings";
import { buildOfficeIssues } from "@/lib/accessibility/office-issues";
import { buildDocxFromPlainText } from "@/lib/docx";
import { type AccessibleItemType, type Issue } from "@/lib/accessibility/types";
import { callLlm, normalizeProvider, type LlmProvider, type LlmPart } from "@/lib/llm";
import {
  generateDeckFromTemplate,
  type DeckGenContext,
  type GeneratedDeck,
} from "@/lib/decks/generate";
import { type DeckTemplate, type DeckTheme } from "@/lib/decks/types";
import { listDeckTemplates } from "@/lib/deck-templates";
import { DECK_PRESETS } from "@/lib/decks/presets";
import { buildSlidesPptx, type PptxSlide, type PptxTheme } from "@/lib/pptx";
import { saveRecordingFile } from "@/lib/recording-files";
import {
  githubConfigured,
  githubWebhookSecret,
  listRepos,
  listOwnedOrgs,
  listOrgRepos,
  listBranches,
  ingestRepo,
  parseRepoRef,
  createRepo,
  createOrgRepo,
  startCopilotBuild,
  createCopilotAgentTask,
  listCopilotTasks,
  deletePaths,
  movePaths,
  generateFromTemplate,
  putFile,
  getFileText,
  getRepo,
  getLatestWorkflowRun,
  listWorkflows,
  dispatchWorkflow,
  findWorkflowRunSince,
  downloadArtifactZip,
  downloadRepoZipball,
  listOrgMembers,
  inviteOrgMember,
  setOrgMemberRole,
  createOrgPushHook,
  listRepoCollaborators,
  setRepoCollaborator,
  createPullRequest,
  setBranchProtection,
  listPersonalRepos,
  updateRepo,
  deleteRepo,
  forkRepo,
  createBranch,
  deleteBranch,
  listCommits,
  listPullRequests,
  mergePullRequest,
  markPullRequestReady,
  listPullRequestReviews,
  reviewPullRequest,
  listPullRequestFiles,
  listWorkflowRuns,
  listRunJobs,
  rerunWorkflowRun,
  cancelWorkflowRun,
  rerunFailedJobs,
  setWorkflowEnabled,
  listRunArtifacts,
  getArtifactDownloadUrl,
  getRunLogsDownloadUrl,
  listPendingDeployments,
  reviewPendingDeployments,
  getRepoTree,
  copyRepo,
  type GithubRepo,
  type RepoDigest,
  type WorkflowRunInfo,
  type WorkflowInfo,
  type OrgMember,
  type RepoCollaborator,
  type RepoPermission,
  type BranchProtectionOptions,
  type UpdateRepoPatch,
  type CommitInfo,
  type PullRequestInfo,
  type PullRequestReviewInfo,
  type PullRequestFileInfo,
  type WorkflowJobInfo,
  type RepoTreeEntry,
  type CopilotTask,
  type ArtifactInfo,
  type PendingDeployment,
  type CopyRepoOptions,
  type CopyRepoResult,
  copyPathsToRepo,
  type CopyPathsOptions,
  type CopyPathsResult,
  setRepoTopics,
} from "@/lib/github";
import {
  listGithubModels,
  chatWithGithubModel,
  type GithubModel,
  type ModelUsage,
  type ChatMessage,
} from "@/lib/github-models";
import { htmlToMarkdown, markdownToHtml } from "@/lib/markdown";
import { filesToLlmParts } from "@/lib/llm-files";
import { classifyFrontend, classifyBackend, type BackendInfo } from "@/lib/frontend-detect";
import {
  courseEngineSchedule,
  courseEngineLecture,
  courseEngineMaterials,
  courseEngineCopilotPrompt,
  type CourseEngineFile,
  type CourseEngineUploadFile,
  type CourseEngineHomework,
  type ScheduleResponse,
} from "@/lib/course-engine";
import {
  gradeViaGradingEngine,
  detectRubricSource,
  type GradingApiResponse,
} from "@/lib/grading-engine";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logChatExchange } from "@/lib/supabase/chat-logs";
import { requireOwner } from "@/lib/supabase/auth";
import {
  listPendingGradingDrafts,
  getGradingDraft,
  createGradingDraft,
  markGradingDraftReviewed,
  updateGradingDraft,
  deleteGradingDraft,
  type GradingDraftPayload,
} from "@/lib/grading-drafts";
import { buildZeroGradingEntry, isZeroableAssignment } from "@/lib/grade-zeros";
import {
  getMessageDraft,
  createMessageDraft,
  markMessageDraftReviewed,
  updateMessageDraft,
  deleteMessageDraft,
  type MessageDraftPayload,
} from "@/lib/message-drafts";
import {
  getPresentationDraft,
  createPresentationDraft,
  markPresentationDraftReviewed,
  updatePresentationDraft,
  deletePresentationDraft,
  listPendingPresentationDrafts,
  type PresentationDraftPayload,
} from "@/lib/presentation-drafts";
import {
  getCredentials,
  getValidAccessToken,
  deleteCredentials,
} from "@/lib/google-credentials";
import {
  listConnectedInstitutionsWithScope,
  getValidAccessToken as getMicrosoftAccessToken,
  deleteCredentials as deleteMicrosoftCredentials,
} from "@/lib/microsoft-credentials";
import {
  listRecentMessages,
  sendMail,
  markMessageRead,
  type Message,
} from "@/lib/microsoft-graph";
import {
  loadInstitutionFields,
  saveInstitutionFields,
  listAllInstitutionFields,
  type InstitutionField,
} from "@/lib/institution-fields";
import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  type SyllabusTemplateMeta,
  type SyllabusTemplate,
} from "@/lib/supabase/syllabus-templates";
import {
  listSyllabi,
  getSyllabus,
  createSyllabus,
  renameSyllabus,
  deleteSyllabus,
  type FinalizedSyllabusMeta,
  type FinalizedSyllabus,
} from "@/lib/supabase/course-syllabi";
import {
  listCourses as listCourseHubRows,
  createCourse as createCourseRow,
  updateCourse as updateCourseRow,
  deleteCourse as deleteCourseRow,
  updateCourseMaterials,
  updateCourseCsv,
  updateCourseRubric,
  appendCourseMaterialFile,
  removeCourseMaterialFile,
  appendCourseExportFile,
  removeCourseExportFile,
  type Course as CourseHub,
  type CourseInput as CourseHubInput,
} from "@/lib/supabase/courses";
import {
  queryFreeBusy,
  createCalendarEvent,
  listCalendarEvents,
  type CalendarEventBlock,
} from "@/lib/google-calendar";
import {
  getSchedulingConfig,
  computeFreeSlots,
  formatSlotsForReply,
} from "@/lib/scheduling";
import {
  listDismissals,
  addDismissal,
  removeDismissal,
} from "@/lib/grading-dismissals";
import { humanizeAssignmentName, stripAssignmentSlugPrefix, looksLikeAssignmentSlug } from "@/lib/assignment-name";
import { assignWeekNumbers, renumberWeekLabel } from "@/lib/week-numbering";
import { splitNarrationText } from "@/lib/narration-chunks";
import { getUserStyle, saveUserStyle, clearVoiceClone } from "@/lib/user-style";
import { getRecordingFileUrl } from "@/lib/recording-files";
import { PROMPT_PREFIX, RESPONSE_PREFIX } from "@/lib/writing-style-prompts";
import {
  TOPIC_ROUTES,
  TOPIC_TO_EXPORT_MAP,
  TOPIC_TO_DIR_MAP,
  parseNavItems,
  matchConcept,
  insertNavLeaf,
  insertTopicPageCase,
} from "@/lib/visualizer";
import type JSZip from "jszip";

// Standard submission guidance appended to every repo-generated assignment instruction
const REPO_SUBMISSION_GUIDANCE = `

## Getting Started

Open the README.md file at the root of your repository first - it explains the project layout and any setup steps you need before you write code.

## Submitting Your Work

1. Commit your work as you go with clear commit messages.
2. Push your commits to your GitHub repository.
3. Copy your repository link (it looks like https://github.com/your-username/your-repo) and paste it into the Canvas assignment as your submission.`;

export interface SlideData {
  title: string;
  bullets: string[];
  // Optional example code snippet, rendered as a formatted monospace code block
  // in the generated deck. Populated on the example slide that immediately
  // follows a coding-concept slide (loops, conditionals, functions, etc.).
  code?: string;
  // Language label for the code block (e.g. "python", "javascript").
  codeLanguage?: string;
}

// Normalize a parsed slide from the model into SlideData, carrying through an
// optional example code block when present. Shared by every Gemini slide path
// so code slides are handled identically everywhere.
function toSlideData(
  raw: { title?: string; bullets?: string[]; code?: string; codeLanguage?: string },
  maxBullets: number
): SlideData {
  const slide: SlideData = {
    title: raw.title!,
    bullets: (raw.bullets ?? []).slice(0, maxBullets),
  };
  if (typeof raw.code === "string" && raw.code.trim()) {
    slide.code = raw.code.replace(/\s+$/, "");
  }
  if (typeof raw.codeLanguage === "string" && raw.codeLanguage.trim()) {
    slide.codeLanguage = raw.codeLanguage.trim();
  }
  return slide;
}

// Force the Walkthrough and Practice slides that follow an Example slide to
// display the Example's reference code. The Example teaches the concept with
// code, the Walkthrough explains that same code line by line, and the Practice
// gives students that worked example to reference while they attempt the
// challenge. Critically, the Practice slide must NOT reveal the answer, so we
// overwrite whatever code the model put there with the Example's reference code
// (not just fill when missing — the model might otherwise leak the solution).
// The Answer slide keeps its own distinct solution code and is never touched.
function propagateExampleCodeToFollowups(slides: SlideData[]): SlideData[] {
  let exampleCode: string | undefined;
  let exampleLanguage: string | undefined;
  for (const slide of slides) {
    if (slide.title.startsWith("Example:")) {
      // Remember this example's code as the reference for the slides that follow.
      exampleCode = slide.code;
      exampleLanguage = slide.codeLanguage;
    } else if (
      (slide.title.startsWith("Walkthrough:") || slide.title.startsWith("Practice:")) &&
      exampleCode
    ) {
      // Always use the Example's reference code, overriding any code the model
      // produced for these slides (a Practice snippet could otherwise spoil the
      // answer; a Walkthrough must match the example it explains).
      slide.code = exampleCode;
      if (exampleLanguage) {
        slide.codeLanguage = exampleLanguage;
      }
    }
  }
  return slides;
}

export interface GenerateLessonPlanResult {
  presentationTitle: string;
  slides: SlideData[];
}

export interface AssignmentStep {
  stepTitle: string;
  description: string;
}

export interface AssignmentData {
  title: string;
  overview: string;
  steps: AssignmentStep[];
  tools: string[];
  deliverables: string[];
}

export interface ModuleIntroData {
  overview: string;
  keyTerms: string;
}

export async function generateModuleIntroAction(
  moduleObjectives: string,
  contextText: string,
  provider: LlmProvider = "gemini"
): Promise<ModuleIntroData | { error: string }> {
  try {
    // Embedded Deterministic Engine: template the intro from the objectives with
    // no model call.
    if (provider === "embedded") {
      return scaffoldModuleIntro(moduleObjectives, contextText);
    }

    const prompt = `You are an expert educator writing a module introduction for students.

MODULE OBJECTIVES:
${moduleObjectives}

CONTEXT:
${contextText || "(none provided)"}

Write a brief module introduction that students read before engaging with any content. Return ONLY valid JSON:
{
  "overview": "...",
  "keyTerms": "..."
}

Requirements:
- "overview": Exactly 2-3 sentences. Explain where these module concepts fit in the broader field or discipline — the big picture, why it matters, and how it connects to what students may already know or have learned previously. Write directly to the student.
- "keyTerms": Exactly 2-3 sentences that introduce the most important terms or concepts students will encounter in this module, defining each briefly in plain language. Write directly to the student.
- Use clear, engaging language. Avoid jargon unless you define it immediately.
- Do not include any text outside the JSON object.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 512 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Module intro generation failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const raw = result.text;

    const jsonText = jsonObjectSlice(raw);
    if (!jsonText) {
      return { error: "Could not parse module intro from the model response." };
    }

    const parsed = JSON.parse(jsonText) as {
      overview?: string;
      keyTerms?: string;
    };

    return {
      overview: parsed.overview ?? "",
      keyTerms: parsed.keyTerms ?? "",
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

export async function generateLessonPlanAction(
  moduleObjectives: string,
  contextText: string,
  files: Array<{ name: string; base64: string; mimeType: string }>,
  revisionPrompt?: string,
  currentSlides?: SlideData[],
  provider: LlmProvider = "gemini",
  homework?: {
    text?: string;
    files?: Array<{ name: string; base64: string; mimeType: string }>;
  }
): Promise<GenerateLessonPlanResult | { error: string }> {
  try {
    // Embedded Deterministic Engine: template a deck outline from the objectives
    // with no model call. A revision request applies concrete edit commands by
    // rule (remove/add/rename slides, replace, shorten); an unparseable one keeps
    // the current slides unchanged.
    if (provider === "embedded") {
      if (revisionPrompt && currentSlides) {
        return {
          presentationTitle: "Lesson Plan",
          slides: applySlidesRevision(currentSlides, revisionPrompt).slides,
        };
      }
      return scaffoldLessonPlan(moduleObjectives, contextText);
    }

    const filesSummary =
      files.length > 0
        ? `\n\nATTACHED FILES (${files.length}):\n${files.map((f) => `- ${f.name}`).join("\n")}`
        : "";

    const revisionSection =
      revisionPrompt && currentSlides
        ? `\n\nCURRENT SLIDE DECK (JSON):\n${JSON.stringify(currentSlides, null, 2)}\n\nREVISION INSTRUCTIONS:\n${revisionPrompt}\n\nUpdate the slide deck based on the revision instructions. Preserve slides that don't need to change; modify, add, or remove slides as needed.`
        : "";

    const homeworkText = homework?.text?.trim() ?? "";
    const homeworkFiles = homework?.files ?? [];
    const hasHomework = homeworkText.length > 0 || homeworkFiles.length > 0;

    const homeworkSection = hasHomework
      ? `\n\nHOMEWORK ASSIGNMENT (the slides must prepare students to complete this, WITHOUT revealing its answers):\n${homeworkText || "(provided as an attached file below)"}`
      : "";

    const homeworkRequirement = hasHomework
      ? `\n- HOMEWORK PREPARATION: A homework assignment is provided above. Ensure the deck teaches every concept, skill, and technique a student needs to complete it confidently on their own. The Example, Practice, and Answer slides MUST use different problems than the homework's own questions. Never restate the homework's exact questions, never solve any homework problem, and never reveal its answers — the goal is to prepare students to do it themselves, not to do it for them.`
      : "";

    const prompt = `You are an expert educator creating a lecture slide deck.

MODULE OBJECTIVES:
${moduleObjectives}

CONTEXT:
${contextText || "(none provided)"}${filesSummary}${revisionSection}${homeworkSection}

Create a complete set of lecture slides that fully address the module objectives. Return ONLY valid JSON:
{
  "presentationTitle": "...",
  "slides": [
    { "title": "...", "bullets": ["...", "...", "..."] },
    { "title": "Case Study: ...", "bullets": ["...", "...", "..."] },
    { "title": "Example: ...", "bullets": ["..."], "code": "...", "codeLanguage": "python" },
    { "title": "Walkthrough: ...", "bullets": ["...", "..."], "code": "...", "codeLanguage": "python" },
    { "title": "Practice: ...", "bullets": ["...", "..."], "code": "...", "codeLanguage": "python" },
    { "title": "Answer: ...", "bullets": ["..."], "code": "...", "codeLanguage": "python" },
    { "title": "Additional Practice: ...", "bullets": ["..."], "code": "...", "codeLanguage": "python" },
    { "title": "Answer: ...", "bullets": ["..."], "code": "...", "codeLanguage": "python" },
    { "title": "Documentation: Key Concepts", "bullets": ["...", "..."] },
    { "title": "Documentation & References", "bullets": ["...", "..."] }
  ]
}

Requirements:
- Each slide must have a "title" and a "bullets" array.
- Maximum 3 bullets per slide.
- Each bullet must be a single, concise idea — no sub-points.
- Use plenty of real-world analogies and concrete examples that students will immediately recognise (everyday technology, social media, sports, food, pop culture, etc.).
- The first slide should be a title/overview slide listing the key topics.
- The SECOND slide MUST be a real-world case study or news story about this module's subject, with "title" beginning with "Case Study:". Name a specific, well-known, widely-documented real event (the organization or product involved and roughly when it happened). Prefer a dramatic, motivating story — a high-profile failure, security breach, or outage, OR an impressive system that was built — to show students why this matters. Use the bullets to summarize what happened, and make the last bullet connect the story to what students are about to learn. Do not put "code" on this slide. Stick to established facts; never invent events or fabricate specifics.
- Include enough slides to thoroughly cover every objective.
- CODING CONCEPTS: Whenever a slide introduces a coding concept (a loop, conditional, variable, function, class, data structure, etc.), it MUST be followed immediately by exactly four slides, in this order:
  1. Example slide — "title" begins with "Example:"; demonstrate that exact concept with a short, correct, self-contained snippet in "code" (use real newlines) and "codeLanguage" set; keep "bullets" to at most one short caption.
  2. Walkthrough slide — "title" begins with "Walkthrough:"; explain the example code line by line in "bullets" while showing the same code in the "code" field; use the exact code from the Example slide so students can read both the code and the explanation together.
  3. Practice slide — "title" begins with "Practice:"; pose a simple, self-contained coding challenge on the same concept for the student to attempt. State the task in 1-2 "bullets" and set "codeLanguage". Its "code" field MUST repeat the SAME reference code shown on the Example/Walkthrough slide so the student has a worked example to reference — it must NOT contain the solution to the practice challenge or any code that gives away the answer.
  4. Answer slide — "title" begins with "Answer:"; give the correct, runnable solution to that exact practice challenge in "code" with "codeLanguage" set, plus at most one "bullets" caption.
- All of Example, Walkthrough, Practice, and Answer slides must include "code"/"codeLanguage". Do not omit "code" on Walkthrough or Practice slides. If the module teaches no programming, omit code fields and the Example/Walkthrough/Practice/Answer slides entirely.
- CLOSING SECTIONS: after all the coverage slides above, ALWAYS append these closing sections at the very END of the deck, in this exact order:
  A. ADDITIONAL PRACTICE: for EACH coding concept you introduced in this deck, add 2-3 NEW slides whose "title" begins with "Additional Practice:" that pose fresh, self-contained challenges on that concept (clearly different from the earlier inline Practice slide). IMMEDIATELY follow each "Additional Practice:" slide with its own "Answer:" slide giving the correct, runnable solution in "code" with "codeLanguage" set. The "Additional Practice:" slide states the task in its bullets and must NOT reveal the solution (it may include a short reference/starter snippet in "code", but never the answer). For a non-programming module, make these 2-3 additional conceptual practice questions per concept, each followed by an "Answer:" slide, with no code fields.
  B. DOCUMENTATION - KEY CONCEPTS: one or more slides whose "title" begins with "Documentation:" that recap the key concepts, terms, and syntax taught in this deck as a concise study reference the student can revise from (use bullets; short code snippets are allowed).
  C. DOCUMENTATION AND REFERENCES: a final slide titled exactly "Documentation & References" that lists authoritative resources for the topics: name the official documentation for each language, library, or tool used, plus 2-4 suggested further-reading resources. Name only real, well-known resources (official language/library documentation, MDN, the tool's own docs); do NOT fabricate specific URLs or invent facts.${homeworkRequirement}
- Do not include any text outside the JSON object.`;

    const parts: Array<
      { text: string } | { inlineData: { mimeType: string; data: string } }
    > = [
      { text: prompt },
      ...(await filesToLlmParts(files)),
      ...(await filesToLlmParts(homeworkFiles, "HOMEWORK ASSIGNMENT")),
    ];

    const result = await callLlm(
      {
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 8192 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `LLM API error: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const raw = result.text;

    const jsonText = jsonObjectSlice(raw);
    if (!jsonText) {
      return { error: "Could not parse slide data from the model response." };
    }

    const parsed = JSON.parse(jsonText) as {
      presentationTitle?: string;
      slides?: Array<{ title?: string; bullets?: string[]; code?: string; codeLanguage?: string }>;
    };

    if (!parsed.slides || !Array.isArray(parsed.slides)) {
      return { error: "Model did not return a valid slides array." };
    }

    let slides: SlideData[] = parsed.slides
      .filter((s) => typeof s.title === "string" && Array.isArray(s.bullets))
      .map((s) => toSlideData(s, 3));

    slides = propagateExampleCodeToFollowups(slides);

    return {
      presentationTitle: parsed.presentationTitle ?? "Lesson Plan",
      slides,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

export async function generateAssignmentAction(
  moduleObjectives: string,
  contextText: string,
  files: Array<{ name: string; base64: string; mimeType: string }>,
  provider: LlmProvider = "gemini"
): Promise<AssignmentData | { error: string }> {
  try {
    // Embedded Deterministic Engine: template the assignment from the objectives
    // with no model call (attached files are not read in this mode).
    if (provider === "embedded") {
      return scaffoldAssignment(moduleObjectives, contextText);
    }

    const filesSummary =
      files.length > 0
        ? `\n\nATTACHED FILES (${files.length}):\n${files.map((f) => `- ${f.name}`).join("\n")}`
        : "";

    const prompt = `You are an expert educator designing a hands-on, industry-simulating assignment.

MODULE OBJECTIVES:
${moduleObjectives}

CONTEXT:
${contextText || "(none provided)"}${filesSummary}

Design a practical assignment that simulates real industry workflows and that students can complete entirely for free. Return ONLY valid JSON:
{
  "title": "...",
  "overview": "...",
  "steps": [
    { "stepTitle": "...", "description": "..." }
  ],
  "tools": ["..."],
  "deliverables": ["..."]
}

Requirements:
- Simulate authentic challenges students will face on the job.
- Every tool listed must be free and accessible (e.g. Python, VS Code, Google Colab, GitHub, Figma free tier, Canva, Google Sheets, Replit, etc.).
- 4–8 concrete, sequential steps that a student can complete working alone.
- Tie every step clearly to the module objectives.
- Deliverables should be specific and assessable.
- Do not include any text outside the JSON object.`;

    const parts: Array<
      { text: string } | { inlineData: { mimeType: string; data: string } }
    > = [
      { text: prompt },
      ...(await filesToLlmParts(files)),
    ];

    const result = await callLlm(
      {
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 2048 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Assignment generation failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const raw = result.text;

    const jsonText = jsonObjectSlice(raw);
    if (!jsonText) {
      return { error: "Could not parse assignment data from the model response." };
    }

    const parsed = JSON.parse(jsonText) as {
      title?: string;
      overview?: string;
      steps?: Array<{ stepTitle?: string; description?: string }>;
      tools?: string[];
      deliverables?: string[];
    };

    return {
      title: parsed.title ?? "Assignment",
      overview: parsed.overview ?? "",
      steps: (parsed.steps ?? [])
        .filter((s) => s.stepTitle && s.description)
        .map((s) => ({ stepTitle: s.stepTitle!, description: s.description! })),
      tools: parsed.tools ?? [],
      deliverables: parsed.deliverables ?? [],
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

export async function generateAssignmentRubricAction(
  moduleObjectives: string,
  contextText: string,
  provider: LlmProvider = "gemini"
): Promise<string | { error: string }> {
  try {
    const instructions = `MODULE OBJECTIVES:\n${moduleObjectives}${contextText ? `\n\nCONTEXT:\n${contextText}` : ""}`;
    return await generateRubric(instructions, provider);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Rubric generation failed." };
  }
}

export interface ExampleItem {
  concept: string;
  title: string;
  content: string;
  explanation: string;
  language?: string;
}

export interface ExamplesData {
  lessonType: "math" | "programming" | "general";
  examples: ExampleItem[];
}

export async function generateExamplesAction(
  moduleObjectives: string,
  contextText: string,
  slides: SlideData[],
  provider: LlmProvider = "gemini"
): Promise<ExamplesData | { error: string }> {
  try {
    // Embedded Deterministic Engine: build typed example placeholders per concept
    // with no model call (worked solutions are left for the instructor).
    if (provider === "embedded") {
      return scaffoldExamples(slides.map((s) => s.title), `${moduleObjectives}\n${contextText}`);
    }

    const conceptList = slides
      .map((s, i) => `${i + 1}. ${s.title}`)
      .join("\n");

    const prompt = `You are an expert educator preparing in-class examples for a lecture.

MODULE OBJECTIVES:
${moduleObjectives}

CONTEXT:
${contextText || "(none provided)"}

CONCEPTS INTRODUCED IN THIS LESSON (one per slide):
${conceptList}

First, determine the primary focus of this lesson:
- "math" if the lesson is primarily about mathematics, statistics, or quantitative methods
- "programming" if the lesson is primarily about programming, software, or coding
- "general" for all other topics

Then generate exactly 2 examples for EACH concept listed above. Each example must:
- Address only the single concept it is assigned to — do not mix in other concepts from the lesson.
- Be appropriate to the lesson type:
  - "math": a worked problem with a clear problem statement and step-by-step solution
  - "programming": a short, complete, runnable code snippet (20–40 lines) with a brief explanation; use the most natural language for the topic
  - "general": a concrete worked example, case study, or demonstration

Return ONLY valid JSON:
{
  "lessonType": "math" | "programming" | "general",
  "examples": [
    {
      "concept": "Exact concept name from the list above",
      "title": "Short descriptive title for this specific example",
      "content": "The problem statement (math) or the full code snippet (programming) or the example scenario (general)",
      "explanation": "Step-by-step solution (math), what the code does and why (programming), or key takeaways (general)",
      "language": "python"
    }
  ]
}

Requirements:
- Produce exactly 2 examples per concept, in concept order.
- Each example must cover only its assigned concept — never blend it with another concept from the lesson.
- "concept" must exactly match the concept name from the list above.
- "language" is required only for programming examples (e.g. "python", "javascript", "java", "c", "sql"); omit it for math and general examples.
- Math problems should include all working steps in "explanation".
- Code examples must be complete and runnable as-is; use comments to annotate key lines.
- Do not include any text outside the JSON object.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 3072 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Examples generation failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const raw = result.text;

    const jsonText = jsonObjectSlice(raw);
    if (!jsonText) {
      return { error: "Could not parse examples from the model response." };
    }

    const parsed = JSON.parse(jsonText) as {
      lessonType?: string;
      examples?: Array<{ concept?: string; title?: string; content?: string; explanation?: string; language?: string }>;
    };

    const lessonType =
      parsed.lessonType === "math" || parsed.lessonType === "programming"
        ? parsed.lessonType
        : "general";

    const examples: ExampleItem[] = (parsed.examples ?? [])
      .filter((e) => e.title && e.content && e.explanation)
      .map((e) => ({
        concept: e.concept ?? "",
        title: e.title!,
        content: e.content!,
        explanation: e.explanation!,
        ...(e.language ? { language: e.language } : {}),
      }));

    return { lessonType, examples };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

export interface TestGeminiState {
  result: string | null;
  error: string | null;
}

export async function testGeminiAction(
  _prev: TestGeminiState,
  formData: FormData
): Promise<TestGeminiState> {
  try {
    const provider = normalizeProvider(formData.get("provider") as string | null);

    const file = formData.get("studentSubmissions") as File | null;
    if (!file || file.size === 0) {
      return { result: null, error: "Please select a zip file to test with." };
    }

    const zipBuffer = await file.arrayBuffer();
    const { submissions } = await extractSubmissions(zipBuffer);

    const entries = Object.entries(submissions);
    if (entries.length === 0) {
      return { result: null, error: "No readable text files found in the zip." };
    }

    // Take the first submission, truncated to 2000 chars to keep the request small
    const [fileName, content] = entries[0];
    const truncated = content.length > 2000 ? content.slice(0, 2000) + "\n\n[truncated]" : content;

    const result = await callLlm(
      {
        contents: [
          {
            role: "user",
            parts: [{ text: `Summarize this student file in one sentence.\n\nFile: ${fileName}\n\n${truncated}` }],
          },
        ],
      },
      provider
    );

    if (!result.ok) {
      return { result: null, error: `HTTP ${result.status}: ${result.body}` };
    }

    const text = result.text || "(no response text)";

    return { result: `[${fileName}] ${text}`, error: null };
  } catch (err) {
    return {
      result: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export interface GradeActionState {
  run: GradingRun | null;
  error: string | null;
  generatedRubric?: string;
  warnings?: string[];
}

// Map the deterministic Grading API response onto the app's GradingRun so the
// existing results matrix in GradingTab renders it unchanged. The grader returns
// no per-student files and no full-credit checklist, so those degrade to "-" /
// hidden in the UI.
//
// When grading from a Canvas URL, pointsPossible re-bases the engine's rubric
// total onto the assignment's real scale (same anchoring as the AI path), so the
// tool never grades out of a different total than Canvas.
function gradingApiToRun(
  resp: GradingApiResponse,
  pointsPossible: number | null = null
): GradingRun {
  return {
    rubricAreaNames: resp.criteria,
    fullCreditChecklist: [],
    results: resp.students.map((s) => {
      const passedCount = s.criteria.filter((c) => c.passed).length;
      const rawAreas = s.criteria.map((c) => ({
        area: c.criterion,
        score: `${c.points_earned}/${c.points_possible}`,
        comment: c.detail,
      }));
      const scaled = scaleResultToPoints(rawAreas, `${s.total}/${s.possible}`, pointsPossible);
      return {
        student: s.student,
        totalScore: scaled.totalScore,
        overallComment: `${passedCount}/${s.criteria.length} checks passed`,
        feedback: "",
        mergedFileCount: 0,
        submittedFiles: [],
        rubricAreas: scaled.rubricAreas,
      };
    }),
  };
}

/**
 * Fetch a Canvas assignment/discussion's description + rubric so the grading
 * form can prefill the instructions and rubric boxes from a pasted URL.
 */
export async function fetchCanvasMetaAction(
  url: string
): Promise<{ description: string; rubricText: string; linkedFileIds: number[] } | { error: string }> {
  try {
    await requireOwner();
    // Return Canvas's own rubric only; never synthesize one when Canvas has none.
    return await fetchCanvasMeta(url);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load Canvas details." };
  }
}

/** Post reviewed grades + comments back to Canvas (one PUT per student). */
export async function postCanvasGradesAction(
  url: string,
  grades: Array<{
    userId: number;
    grade?: string;
    comment?: string;
    rubricAreas?: Array<{ area: string; score: string; comment: string }>;
  }>
): Promise<
  { posted: number; failures: Array<{ userId: number; error: string }> } | { error: string }
> {
  try {
    await requireOwner();
    return await postCanvasGrades(url, grades);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not post grades to Canvas." };
  }
}

// ── Grading drafts ───────────────────────────────────────────────────────
//
// Persistence for the unattended grade-to-draft step's output and the
// app-open review-grading-draft step's read/mark-reviewed calls. Every
// action below is owner-gated and uses the service-role client + the
// owner's own id (from requireOwner()) - the same pattern as the rest of
// this file's Supabase-backed actions - so it works identically whether
// called from a signed-in browser session or, via requireOwner()'s
// runAsOwner impersonation, from inside a headless cron run
// (src/app/api/cron/run-schedules/route.ts). NONE of these actions post
// anything to Canvas; posting only ever happens through
// postCanvasGradesAction above, called from the post-grades step after the
// user approves rows in the review table.

/** Save a new pending grading draft (the grade-to-draft step's output). */
export async function saveGradingDraftAction(
  summary: string,
  payload: GradingDraftPayload,
  workflowId?: string,
  workflowName?: string
): Promise<{ id: string } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const draft = await createGradingDraft(supabase, user.id, { summary, payload, workflowId, workflowName });
    return { id: draft.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the grading draft." };
  }
}

// ── Cartridge drops ──────────────────────────────────────────────────────
//
// Centralized submissions archive upload for closed/LMS-less courses.
// Workflow trigger fires when new drops appear; triggered workflow grades
// each drop and produces a gradebook CSV ready to upload, plus a reviewable
// grading draft. All actions require owner context.

/**
 * List all status='new' cartridge drop IDs for the owner.
 * Used by the trigger evaluator (both browser watcher and server runner).
 */
export async function listNewCartridgeDropIdsAction(): Promise<
  { ids: string[]; count: number } | { error: string }
> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();

    const { data: rows, error } = await (supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("cartridge_drops") as any)
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "new");

    if (error) {
      return { error: error.message };
    }

    const ids = (rows || []).map((r: { id: string }) => r.id);
    return { ids, count: ids.length };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list cartridge drops." };
  }
}

/**
 * List full cartridge_drops rows with status='new', oldest first.
 * Used by the grade-cartridge-submissions step.
 */
export async function listNewCartridgeDropsAction(
  limit: number
): Promise<Array<{
  id: string;
  name: string;
  courseLabel: string;
  assignmentLabel: string;
  pointsPossible: number | null;
  rubricText: string | null;
  lms: string;
  storagePath: string;
  sizeBytes: number;
}> | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();

    const { data: rows, error } = await (supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("cartridge_drops") as any)
      .select("id, name, course_label, assignment_label, points_possible, rubric_text, lms, storage_path, size_bytes")
      .eq("user_id", user.id)
      .eq("status", "new")
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) {
      return { error: error.message };
    }

    return ((rows ?? []) as Array<{
      id: string;
      name: string;
      course_label: string;
      assignment_label: string;
      points_possible: number | null;
      rubric_text: string | null;
      lms: string;
      storage_path: string;
      size_bytes: number;
    }>).map((r) => ({
      id: r.id,
      name: r.name,
      courseLabel: r.course_label,
      assignmentLabel: r.assignment_label,
      pointsPossible: r.points_possible,
      rubricText: r.rubric_text,
      lms: r.lms,
      storagePath: r.storage_path,
      sizeBytes: r.size_bytes,
    }));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list cartridge drops." };
  }
}

/**
 * CAS status 'new' -> 'processing'; returns row + zip base64 downloaded from storage.
 * Enforces 8MB size cap on base64-safe encoding.
 * Used by the grade-cartridge-submissions step before grading.
 */
export async function takeCartridgeDropAction(id: string): Promise<{
  id: string;
  courseLabel: string;
  assignmentLabel: string;
  pointsPossible: number | null;
  rubricText: string | null;
  lms: string;
  zipBase64: string;
} | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();

    // CAS update: status='new' -> 'processing'
    const { data: rows, error: updateError } = await (supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("cartridge_drops") as any)
      .update({ status: "processing" })
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("status", "new")
      .select("id, course_label, assignment_label, points_possible, rubric_text, lms, storage_path, size_bytes")
      .single();

    if (updateError || !rows) {
      return { error: updateError?.message || "Drop not found or already processing." };
    }

    // Download from storage
    const { data: blob, error: downloadError } = await supabase.storage
      .from("cartridge-drops")
      .download(rows.storage_path);

    if (downloadError || !blob) {
      return { error: downloadError?.message || "Could not download the cartridge." };
    }

    // Convert to base64
    const arrayBuffer = await blob.arrayBuffer();
    const zipBase64 = Buffer.from(arrayBuffer).toString("base64");

    // Size cap check (8MB base64-safe)
    const MAX_BASE64_SIZE = 8_000_000;
    if (zipBase64.length > MAX_BASE64_SIZE) {
      return { error: "The cartridge is too large to grade (exceeds 8 MB)." };
    }

    return {
      id: rows.id,
      courseLabel: rows.course_label,
      assignmentLabel: rows.assignment_label,
      pointsPossible: rows.points_possible,
      rubricText: rows.rubric_text,
      lms: rows.lms,
      zipBase64,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not take the cartridge drop." };
  }
}

/**
 * Mark a cartridge drop as graded (with CSV) or error.
 * Uploads CSV to storage at ${userId}/${id}-grades.csv.
 * Sets csv_storage_path, csv_name, graded_at, and status.
 * Used by the grade-cartridge-submissions step after grading.
 */
export async function finishCartridgeDropAction(
  id: string,
  outcome:
    | { status: "graded"; csvName: string; csvBase64: string }
    | { status: "error"; error: string }
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();

    if (outcome.status === "error") {
      const { error } = await (supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("cartridge_drops") as any)
        .update({
          status: "error",
          error: outcome.error,
        })
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) {
        return { error: error.message };
      }
      return { ok: true };
    }

    // Graded: upload CSV to storage
    const csvPath = `${user.id}/${id}-grades.csv`;
    const csvBlob = new Blob([Buffer.from(outcome.csvBase64, "base64")], {
      type: "text/csv",
    });

    const { error: uploadError } = await supabase.storage
      .from("cartridge-drops")
      .upload(csvPath, csvBlob, { contentType: "text/csv", upsert: true });

    if (uploadError) {
      return { error: uploadError.message };
    }

    // Update row with CSV metadata and status='graded'
    const { error: updateError } = await (supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("cartridge_drops") as any)
      .update({
        status: "graded",
        csv_storage_path: csvPath,
        csv_name: outcome.csvName,
        graded_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id);

    if (updateError) {
      return { error: updateError.message };
    }

    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not finish the cartridge drop." };
  }
}

export type MissingAssignmentReport = {
  assignmentId: string;
  assignmentName: string;
  dueAt: string | null;
  pointsPossible: number | null;
  students: Array<{ userId?: number; name: string; email?: string }>;
};

/**
 * List every student who has not submitted a past-due assignment in a Canvas
 * course (already-graded students and unexpired extensions are skipped).
 * Report only - creates no draft, writes nothing.
 */
export async function listMissingSubmissionsAction(input: {
  courseUrl: string;
  assignmentId?: string;
}): Promise<{ missing: MissingAssignmentReport[]; summary: string } | { error: string }> {
  try {
    await requireOwner();

    // Resolve institution/token from course URL
    const { baseUrl, token, institution } = resolveInstitution(input.courseUrl);

    // Parse course ID from URL
    const courseMatch = input.courseUrl.match(/courses\/(\d+)/);
    if (!courseMatch || !courseMatch[1]) {
      return { error: "Could not parse the Canvas course ID from the URL." };
    }
    const courseId = courseMatch[1];

    // Get current time for due date comparison
    const nowIso = new Date().toISOString();

    // Determine target assignment IDs
    let targetIds: string[] = [];
    if (input.assignmentId && input.assignmentId.trim()) {
      // Single assignment: extract numeric ID from URL or bare id
      const assignId = input.assignmentId.trim();
      const match = assignId.match(/assignments\/(\d+)/);
      const bareId = match ? match[1] : /^\d+$/.test(assignId) ? assignId : null;
      if (bareId) {
        targetIds = [bareId];
      } else {
        return { error: "Could not parse the assignment ID. Provide a URL or numeric ID." };
      }
    } else {
      // Sweep all past-due zeroable assignments
      const briefs = await listAssignmentBriefsWithDue(baseUrl, token, institution, courseId);
      const now = new Date(nowIso).getTime();
      targetIds = briefs
        .filter(
          (b) =>
            b.dueAt &&
            new Date(b.dueAt).getTime() < now &&
            isZeroableAssignment({
              submissionTypes: b.submissionTypes,
              gradingType: b.gradingType,
              published: b.published,
              omitFromFinalGrade: b.omitFromFinalGrade,
            })
        )
        .map((b) => b.assignmentId);
    }

    if (targetIds.length === 0) {
      return {
        missing: [],
        summary: "No missing submissions found.",
      };
    }

    // Collect missing submissions per assignment
    const missing: MissingAssignmentReport[] = [];

    for (const assignmentId of targetIds) {
      const result = await listAssignmentNonSubmitters(
        baseUrl,
        token,
        institution,
        courseId,
        assignmentId,
        nowIso
      );

      if (!result.eligible) {
        if (input.assignmentId) {
          return {
            missing: [],
            summary: `That assignment ${result.ineligibleReason ?? "cannot be processed"}.`,
          };
        }
        continue;
      }

      if (result.nonSubmitters.length === 0) {
        continue;
      }

      missing.push({
        assignmentId,
        assignmentName: result.assignmentName,
        dueAt: result.dueAt ?? null,
        pointsPossible: result.pointsPossible ?? null,
        students: result.nonSubmitters.map((s) => ({
          userId: s.userId,
          name: s.name,
        })),
      });
    }

    if (missing.length === 0) {
      return {
        missing: [],
        summary: "No missing submissions found.",
      };
    }

    const totalStudents = missing.reduce((sum, a) => sum + a.students.length, 0);
    const summary = `${totalStudents} student(s) missing work across ${missing.length} assignment(s).`;

    return { missing, summary };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not list missing submissions.",
    };
  }
}

/**
 * Draft zeros for students who did not submit an assignment by its deadline.
 * Resolves the Canvas course URL, fetches non-submitters, builds grading entries,
 * and saves a draft ready for review.
 */
export async function draftZerosForMissingAction(input: {
  courseUrl: string;
  assignmentId?: string;
}): Promise<
  { draftId: string | null; assignmentsAffected: number; zeroed: number; summary: string } | { error: string }
> {
  try {
    await requireOwner();
    const supabase = createServiceClient();

    // Resolve institution/token from course URL
    const { baseUrl, token, institution } = resolveInstitution(input.courseUrl);

    // Parse course ID from URL
    const courseMatch = input.courseUrl.match(/courses\/(\d+)/);
    if (!courseMatch || !courseMatch[1]) {
      return { error: "Could not parse the Canvas course ID from the URL." };
    }
    const courseId = courseMatch[1];

    // Get current time for due date comparison
    const nowIso = new Date().toISOString();

    // Determine target assignment IDs
    let targetIds: string[] = [];
    if (input.assignmentId && input.assignmentId.trim()) {
      // Single assignment: extract numeric ID from URL or bare id
      const assignId = input.assignmentId.trim();
      const match = assignId.match(/assignments\/(\d+)/);
      const bareId = match ? match[1] : /^\d+$/.test(assignId) ? assignId : null;
      if (bareId) {
        targetIds = [bareId];
      } else {
        return { error: "Could not parse the assignment ID. Provide a URL or numeric ID." };
      }
    } else {
      // Sweep all past-due zeroable assignments
      const briefs = await listAssignmentBriefsWithDue(baseUrl, token, institution, courseId);
      const now = new Date(nowIso).getTime();
      targetIds = briefs
        .filter(
          (b) =>
            b.dueAt &&
            new Date(b.dueAt).getTime() < now &&
            isZeroableAssignment({
              submissionTypes: b.submissionTypes,
              gradingType: b.gradingType,
              published: b.published,
              omitFromFinalGrade: b.omitFromFinalGrade,
            })
        )
        .map((b) => b.assignmentId);
    }

    if (targetIds.length === 0) {
      return {
        draftId: null,
        assignmentsAffected: 0,
        zeroed: 0,
        summary: "No missing submissions past the deadline were found.",
      };
    }

    // Build grading entries for each target assignment
    const entries: GradingRunEntry[] = [];
    let totalZeroed = 0;

    for (const assignmentId of targetIds) {
      const result = await listAssignmentNonSubmitters(
        baseUrl,
        token,
        institution,
        courseId,
        assignmentId,
        nowIso
      );

      if (!result.eligible) {
        if (input.assignmentId) {
          return {
            draftId: null,
            assignmentsAffected: 0,
            zeroed: 0,
            summary: `That assignment ${result.ineligibleReason ?? "cannot be auto-zeroed"}, so no zeros were drafted.`,
          };
        }
        continue;
      }

      if (result.nonSubmitters.length === 0) {
        continue;
      }

      totalZeroed += result.nonSubmitters.length;
      const entry = buildZeroGradingEntry({
        courseName: "Course",
        assignmentName: result.assignmentName,
        canvasUrl: `${baseUrl}/courses/${courseId}/assignments/${assignmentId}`,
        institution: institution.code,
        assignmentId,
        pointsPossible: result.pointsPossible,
        nonSubmitters: result.nonSubmitters,
      });

      entries.push(entry);
    }

    if (entries.length === 0) {
      return {
        draftId: null,
        assignmentsAffected: 0,
        zeroed: 0,
        summary: "No missing submissions past the deadline were found.",
      };
    }

    // Save the draft
    const user = await requireOwner();
    const summary = `Drafted 0 for ${totalZeroed} missing submission(s) across ${entries.length} assignment(s).`;
    const draft = await createGradingDraft(supabase, user.id, {
      summary,
      payload: { runs: entries },
    });

    return {
      draftId: draft.id,
      assignmentsAffected: entries.length,
      zeroed: totalZeroed,
      summary,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not draft zeros for missing submissions.",
    };
  }
}

/** Lightweight listing (id/summary/createdAt only) of the owner's pending
 * drafts, oldest first. */
export async function listPendingGradingDraftsAction(): Promise<
  { drafts: Array<{ id: string; summary: string; createdAt: string }> } | { error: string }
> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const drafts = await listPendingGradingDrafts(supabase, user.id);
    return {
      drafts: drafts.map((d) => ({ id: d.id, summary: d.summary, createdAt: d.createdAt })),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load grading drafts." };
  }
}

/** One draft's full payload (the runs the review-grading-draft step
 * reconstructs into review rows). */
export async function getGradingDraftAction(
  id: string
): Promise<
  | {
      draft: {
        id: string;
        status: "pending" | "reviewed";
        summary: string;
        payload: GradingDraftPayload;
      };
    }
  | { error: string }
> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const draft = await getGradingDraft(supabase, user.id, id);
    if (!draft) {
      return { error: "That grading draft was not found." };
    }
    return {
      draft: {
        id: draft.id,
        status: draft.status,
        summary: draft.summary,
        payload: draft.payload,
      },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the grading draft." };
  }
}

/** Mark a draft reviewed (called from the review table's transform closure
 * on submit only - never on skip). Idempotent, so a best-effort caller never
 * needs to check the draft's current status first. */
export async function markGradingDraftReviewedAction(
  id: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    await markGradingDraftReviewed(supabase, user.id, id);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the grading draft." };
  }
}

/** Delete a draft outright (e.g. an optional "discard" action). */
export async function deleteGradingDraftAction(
  id: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    await deleteGradingDraft(supabase, user.id, id);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the grading draft." };
  }
}

/** Persist edited scores/comments back to a pending draft. */
export async function updateGradingDraftPayloadAction(
  id: string,
  payload: GradingDraftPayload
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    await updateGradingDraft(supabase, user.id, id, { payload });
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the grading draft." };
  }
}

/** Post EVERY gradable result in a draft to Canvas, then mark it reviewed.
 * Mirrors the post-grades step's payload construction. */
export async function postGradingDraftAction(
  id: string
): Promise<{ posted: number; failed: number } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const draft = await getGradingDraft(supabase, user.id, id);
    if (!draft) return { error: "That grading draft was not found." };

    let posted = 0;
    let failed = 0;
    const fractionRegex = /(-?\d+(?:\.\d+)?)\s*\/\s*-?\d+/;

    for (const entry of draft.payload.runs) {
      if (entry.offline || !entry.canvasUrl) continue;
      const grades = entry.run.results
        .filter((r) => typeof r.userId === "number")
        .map((r) => {
          const m = r.totalScore.match(fractionRegex);
          const grade = m ? m[1] : (r.totalScore.match(/-?\d+(?:\.\d+)?/) ?? [])[0] ?? "";
          return {
            userId: r.userId as number,
            grade,
            comment: r.overallComment,
            rubricAreas: r.rubricAreas,
          };
        });
      if (grades.length === 0) continue;
      const res = await postCanvasGradesAction(entry.canvasUrl, grades);
      if ("error" in res) {
        failed += grades.length;
      } else {
        posted += res.posted;
        failed += res.failures.length;
      }
    }

    if (failed === 0) {
      await markGradingDraftReviewed(supabase, user.id, id);
    }
    return { posted, failed };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not post the grades." };
  }
}

// ── Message drafts ───────────────────────────────────────────────────────
//
// Persistence for the save-message-draft workflow step's output. Every action
// below is owner-gated and uses the service-role client + the owner's own id
// (from requireOwner()) - the same pattern as the grading-draft actions - so
// it works identically whether called from a signed-in browser session or,
// via requireOwner()'s runAsOwner impersonation, from inside a headless cron
// run. NONE of these actions post anything to Canvas; posting only ever
// happens through createAnnouncementAction or replyToConversationAction above,
// called from the post-message step after the user approves a draft.

/**
 * E9: Draft one short, personalized reminder message per student with missing work.
 * Saved to Drafts > Messages for review. Nothing sends until approved.
 * Falls back to deterministic scaffold if LLM fails.
 */
export async function draftStudentNudgesAction(
  courseUrl: string,
  missingJson: string,
  extraNotes: string,
  provider: LlmProvider = "gemini",
  workflowId?: string,
  workflowName?: string,
  hubCourseId?: string
): Promise<{ drafted: number; preview: string } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();

    // Parse missing assignments JSON
    let missing: MissingAssignmentReport[];
    try {
      missing = JSON.parse(missingJson) as MissingAssignmentReport[];
    } catch {
      return { error: "Provide the missing-submissions JSON from List missing submissions." };
    }

    if (!Array.isArray(missing)) {
      return { error: "Provide the missing-submissions JSON from List missing submissions." };
    }

    // Group by student key (userId ?? email ?? name)
    const studentMap = new Map<string, { userId?: number; name: string; email?: string; lines: string[] }>();

    for (const assignment of missing) {
      for (const student of assignment.students) {
        const key = String(student.userId ?? student.email ?? student.name);
        if (!studentMap.has(key)) {
          studentMap.set(key, {
            ...(student.userId !== undefined ? { userId: student.userId } : {}),
            name: student.name,
            ...(student.email ? { email: student.email } : {}),
            lines: [],
          });
        }
        const line = `${assignment.assignmentName}${assignment.dueAt ? ` (was due ${assignment.dueAt})` : ""}`;
        studentMap.get(key)!.lines.push(line);
      }
    }

    if (studentMap.size === 0) {
      return { drafted: 0, preview: "No students to nudge." };
    }

    const students = Array.from(studentMap.entries())
      .map(([, student]) => student)
      .sort((a, b) => {
        if (a.userId && b.userId) return a.userId - b.userId;
        if (a.userId) return -1;
        if (b.userId) return 1;
        return a.name.localeCompare(b.name);
      });

    // Prepare messages per student
    const studentMessages = new Map<string, { body: string }>();

    if (provider === "embedded") {
      // Use deterministic scaffold for each student. Key from the student's
      // own row (not a name lookup) so two students sharing a name still
      // each get their own message.
      for (const student of students) {
        const body = scaffoldStudentNudge(student.name, student.lines, extraNotes);
        const key = String(student.userId ?? student.email ?? student.name);
        studentMessages.set(key, { body });
      }
    } else {
      // Use LLM to generate all nudges at once
      const studentLines = students
        .map((s) => {
          const id = s.userId ? `ID: ${s.userId}` : s.email ? `Email: ${s.email}` : "Name";
          return `\nStudent: ${s.name} (${id})\nMissing:\n${s.lines.map((l) => `  - ${l}`).join("\n")}`;
        })
        .join("\n");

      const styleBlock = await getWritingStyleBlock(user.id);

      const prompt = `You are an instructor sending personalized reminder messages to students with missing work.

STUDENTS AND THEIR MISSING ASSIGNMENTS:
${studentLines}

EXTRA CONTEXT FOR ALL MESSAGES:
${extraNotes.trim() || "(none)"}${styleBlock}

Draft one short, warm reminder message for EACH student. Messages should be plain text, no emojis, no threats. Mention each missing assignment by name. Fold in the extra context when relevant. Sign off "Your instructor".

Return ONLY a valid JSON array with exactly one object per student:
[
  {"name": "Student Name", "message": "..."},
  {"name": "Another Student", "message": "..."}
]

Do not include any text outside the JSON array.`;

      const result = await callLlm(
        {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 4096 },
        },
        provider
      );

      // Parse LLM result
      let llmMessages: Array<{ name: string; message: string }> = [];
      if (result.ok) {
        try {
          const jsonText = jsonObjectSlice(result.text);
          if (jsonText) {
            const parsed = parseLenientJsonArray(jsonText);
            if (parsed) {
              llmMessages = parsed.map((obj: unknown) => {
                const o = obj as { name?: unknown; message?: unknown };
                return {
                  name: typeof o.name === "string" ? o.name : "",
                  message: typeof o.message === "string" ? o.message : "",
                };
              });
            }
          }
        } catch {
          // Fall through to scaffold fallback
        }
      }

      // Assign messages, fallback to scaffold for missing students
      for (const student of students) {
        const llmMsg = llmMessages.find((m) => m.name === student.name);
        const key = String(student.userId ?? student.email ?? student.name);
        if (llmMsg && llmMsg.message.trim()) {
          studentMessages.set(key, { body: llmMsg.message.trim() });
        } else {
          const body = scaffoldStudentNudge(student.name, student.lines, extraNotes);
          studentMessages.set(key, { body });
        }
      }
    }

    // Save one draft per student
    let drafted = 0;
    let firstPreview = "";

    for (const student of students) {
      const key = String(student.userId ?? student.email ?? student.name);
      const msg = studentMessages.get(key);
      if (!msg) continue;

      const context = student.lines.map((l) => `- ${l}`).join("\n");
      const summary = `Nudge ${student.name} - ${student.lines.length} missing assignment(s)`;

      const payload: MessageDraftPayload = {
        kind: "message",
        body: msg.body,
        ...(courseUrl.trim() ? { courseUrl } : {}),
        recipientName: student.name,
        context,
        ...(student.userId !== undefined ? { recipientUserId: String(student.userId) } : {}),
        ...(student.email ? { recipientEmail: student.email } : {}),
        ...(hubCourseId ? { hubCourseId } : {}),
      };

      await createMessageDraft(supabase, user.id, {
        summary,
        payload,
        workflowId,
        workflowName,
      });

      drafted += 1;
      if (drafted === 1) {
        firstPreview = msg.body;
      }
    }

    return { drafted, preview: firstPreview };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not draft student nudges.",
    };
  }
}

/** Save a new pending message draft. */
export async function saveMessageDraftAction(
  summary: string,
  payload: MessageDraftPayload,
  workflowId?: string,
  workflowName?: string
): Promise<{ id: string } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const draft = await createMessageDraft(supabase, user.id, { summary, payload, workflowId, workflowName });
    return { id: draft.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the message draft." };
  }
}

/** One draft's full payload. */
export async function getMessageDraftAction(
  id: string
): Promise<
  | {
      draft: {
        id: string;
        status: "pending" | "reviewed";
        summary: string;
        payload: MessageDraftPayload;
      };
    }
  | { error: string }
> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const draft = await getMessageDraft(supabase, user.id, id);
    if (!draft) {
      return { error: "That message draft was not found." };
    }
    return {
      draft: {
        id: draft.id,
        status: draft.status,
        summary: draft.summary,
        payload: draft.payload,
      },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the message draft." };
  }
}

/** Mark a draft reviewed. Idempotent. */
export async function markMessageDraftReviewedAction(
  id: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    await markMessageDraftReviewed(supabase, user.id, id);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the message draft." };
  }
}

/** Delete a draft outright. */
export async function deleteMessageDraftAction(
  id: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    await deleteMessageDraft(supabase, user.id, id);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the message draft." };
  }
}

/** Update a draft's payload. */
export async function updateMessageDraftPayloadAction(
  id: string,
  payload: MessageDraftPayload
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    await updateMessageDraft(supabase, user.id, id, { payload });
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the message draft." };
  }
}

/** Count of the owner's PENDING message drafts. */
export async function countPendingMessageDrafts(): Promise<{ count: number }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const { count } = await supabase
      .from("message_drafts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "pending");
    return { count: count ?? 0 };
  } catch {
    return { count: 0 };
  }
}

/**
 * Send a new direct Canvas conversation message to a single student.
 */
export async function sendCanvasMessageAction(
  courseUrl: string,
  recipientUserId: string,
  body: string,
  subject?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await createConversation(courseUrl, recipientUserId, body, subject);
    return { ok: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not send the message.",
    };
  }
}

/** Post a message draft to Canvas (as a reply, announcement, or new message), then mark it reviewed. */
export async function postMessageDraftAction(
  id: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const draft = await getMessageDraft(supabase, user.id, id);
    if (!draft) return { error: "That message draft was not found." };

    const { payload } = draft;

    if (payload.kind === "reply") {
      if (!payload.conversationId || !/^\d+$/.test(payload.conversationId)) {
        return { error: "Invalid or missing conversation id for reply." };
      }
      const res = await replyToConversationAction(Number(payload.conversationId), payload.body, payload.institution || undefined);
      if ("error" in res) throw new Error(res.error);
    } else if (payload.kind === "announcement") {
      if (!payload.courseUrl) {
        return { error: "Invalid or missing course URL for announcement." };
      }
      const res = await createAnnouncementAction(
        payload.courseUrl,
        payload.title || "Announcement",
        payload.body,
        payload.institution || undefined
      );
      if ("error" in res) throw new Error(res.error);
    } else if (payload.kind === "message") {
      if (!payload.courseUrl || !payload.recipientUserId || !/^\d+$/.test(payload.recipientUserId)) {
        return { error: "Invalid or missing recipient for message." };
      }
      const res = await sendCanvasMessageAction(
        payload.courseUrl,
        payload.recipientUserId,
        payload.body,
        payload.title || undefined
      );
      if ("error" in res) throw new Error(res.error);
    } else {
      return { error: "Unknown message draft kind." };
    }

    await markMessageDraftReviewed(supabase, user.id, id);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not post the message." };
  }
}

// ── Presentation Drafts (Chunk 4) ──────────────────────────────────────────

/** Save a new pending presentation draft. */
export async function savePresentationDraftAction(
  summary: string,
  payload: PresentationDraftPayload,
  workflowId?: string,
  workflowName?: string
): Promise<{ id: string } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const draft = await createPresentationDraft(supabase, user.id, {
      summary,
      payload,
      workflowId,
      workflowName,
    });
    return { id: draft.id };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not save the presentation draft.",
    };
  }
}

/** List pending presentation drafts for the owner. */
export async function listPendingPresentationDraftsAction(): Promise<
  { drafts: Array<{ id: string; status: string; summary: string; payload: PresentationDraftPayload; createdAt: string; workflowId?: string; workflowName?: string }> } | { error: string }
> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const drafts = await listPendingPresentationDrafts(supabase, user.id);
    return {
      drafts: drafts.map((d) => ({
        id: d.id,
        status: d.status,
        summary: d.summary,
        payload: d.payload,
        createdAt: d.createdAt,
        workflowId: d.workflowId,
        workflowName: d.workflowName,
      })),
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not load presentation drafts.",
    };
  }
}

/** One draft's full payload. */
export async function getPresentationDraftAction(
  id: string
): Promise<
  | {
      draft: {
        id: string;
        status: "pending" | "reviewed";
        summary: string;
        payload: PresentationDraftPayload;
      };
    }
  | { error: string }
> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const draft = await getPresentationDraft(supabase, user.id, id);
    if (!draft) {
      return { error: "That presentation draft was not found." };
    }
    return {
      draft: {
        id: draft.id,
        status: draft.status,
        summary: draft.summary,
        payload: draft.payload,
      },
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not load the presentation draft.",
    };
  }
}

/** Mark a draft reviewed. Idempotent. */
export async function markPresentationDraftReviewedAction(
  id: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    await markPresentationDraftReviewed(supabase, user.id, id);
    return { ok: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not update the presentation draft.",
    };
  }
}

/** Delete a draft outright. */
export async function deletePresentationDraftAction(
  id: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    await deletePresentationDraft(supabase, user.id, id);
    return { ok: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not delete the presentation draft.",
    };
  }
}

/** Update a draft's payload. */
export async function updatePresentationDraftPayloadAction(
  id: string,
  payload: PresentationDraftPayload
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    await updatePresentationDraft(supabase, user.id, id, { payload });
    return { ok: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not save the presentation draft.",
    };
  }
}

/** Count of the owner's PENDING presentation drafts. */
export async function countPendingPresentationDrafts(): Promise<{ count: number }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const { count } = await supabase
      .from("presentation_drafts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "pending");
    return { count: count ?? 0 };
  } catch {
    return { count: 0 };
  }
}

// ── Deck Templates (Chunk 5) ──────────────────────────────────────────

/** List all saved deck templates for the owner. */
export async function listDeckTemplatesAction(): Promise<{ templates: DeckTemplate[] } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    return { templates: await listDeckTemplates(supabase, user.id) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list templates." };
  }
}

/** Load a deck template by id or name (including presets). */
export async function getDeckTemplateAction(
  idOrName: string
): Promise<{ template: DeckTemplate } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const all = await listDeckTemplates(supabase, user.id);
    const key = String(idOrName ?? "").trim();
    // Also let presets resolve by id/name so a workflow can target a built-in template.
    const pool = [...DECK_PRESETS, ...all];
    const found =
      pool.find((t) => t.id === key) ||
      pool.find((t) => t.name.trim().toLowerCase() === key.toLowerCase());
    if (!found) return { error: `No deck template matches "${key}".` };
    return { template: found };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the template." };
  }
}

/** Run one submission's code on demand (the results page Run button). */
export async function runSubmissionCodeAction(
  files: Array<{ name: string; extension: string; rawBase64?: string; previewContent?: string }>
): Promise<CodeRunResult | null> {
  // Owner-gated like the rest of the file: this relays code execution through
  // the server's sandbox credentials.
  await requireOwner();
  return runSubmittedCode(files);
}

// ── Canvas announcements + inbox (the Canvas tab) ───────────────────────────
//
// Every action below is owner-gated (owner allowlist + AAL2) because it uses the
// privileged Canvas API token, or — for the AI drafts — bills LLM usage. Each
// returns plain serializable data or an { error } string the UI surfaces inline.

/** Load a course's name + recent announcements for the announcements panel. */
/** List the active teacher courses for an institution (announcements picker). */
export async function listCoursesAction(
  acronym: string
): Promise<{ courses: CanvasCourse[] } | { error: string }> {
  try {
    await requireOwner();
    return { courses: await listCourses(acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load courses." };
  }
}

export async function listAssignmentsAction(
  code: string,
  courseId: string
): Promise<{ assignments: CanvasAssignmentBrief[] } | { error: string }> {
  try {
    await requireOwner();
    return { assignments: await listAssignments(code.trim().toUpperCase(), courseId) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list assignments." };
  }
}

export async function listStudentsAction(
  code: string,
  courseId: string
): Promise<{ students: CanvasPerson[] } | { error: string }> {
  try {
    await requireOwner();
    return { students: await listStudents(code.trim().toUpperCase(), courseId) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list students." };
  }
}

export async function listCourseRosterAction(
  code: string,
  courseId: string
): Promise<{ students: CanvasRosterEntry[] } | { error: string }> {
  try {
    await requireOwner();
    return { students: await listCourseRoster(code.trim().toUpperCase(), courseId) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the roster." };
  }
}

export async function listCourseGradeSummariesAction(
  code: string,
  courseId: string
): Promise<
  | {
      students: Array<{ userId: string; name: string; currentScore: number | null; finalScore: number | null }>;
    }
  | { error: string }
> {
  try {
    await requireOwner();
    const summaries = await listStudentGradeSummaries(code.trim().toUpperCase(), courseId);
    return { students: summaries };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load grade summaries." };
  }
}

export async function listAssignmentTextSubmissionsAction(
  code: string,
  courseId: string,
  assignmentId: string
): Promise<{ submissions: CanvasTextSubmission[] } | { error: string }> {
  try {
    await requireOwner();
    return {
      submissions: await listAssignmentTextSubmissions(
        code.trim().toUpperCase(),
        courseId,
        assignmentId
      ),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read submissions." };
  }
}

export async function listCourseAssignmentDueDatesAction(
  code: string,
  courseId: string
): Promise<{ assignments: Array<{ assignmentId: string; name: string; dueAt: string | null }> } | { error: string }> {
  try {
    await requireOwner();
    return { assignments: await listCourseAssignmentDueDates(code.trim().toUpperCase(), courseId) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load assignment due dates." };
  }
}

export async function listAssignmentDueDatesByUrlAction(
  courseUrl: string,
  fallbackAcronym?: string
): Promise<{ assignments: Array<{ assignmentId: string; name: string; dueAt: string | null }>; institution: string } | { error: string }> {
  try {
    await requireOwner();

    // Check if the URL is absolute (parseable as a full URL)
    let isAbsolute = false;
    try {
      new URL(courseUrl);
      isAbsolute = true;
    } catch {
      // relative URL
    }

    // Resolve institution from URL, with fallback to acronym for relative URLs only
    let resolved;
    try {
      resolved = resolveInstitution(courseUrl);
    } catch (e) {
      // Absolute URLs must resolve from their host; don't fall back to acronym
      if (isAbsolute) {
        return { error: e instanceof Error ? e.message : "Could not match the course URL to a configured institution." };
      }
      // Relative URLs can fall back to the provided acronym
      try {
        resolved = resolveInstitutionByCode((fallbackAcronym ?? "").trim().toUpperCase());
      } catch {
        return { error: "Could not match the course URL to a configured institution." };
      }
    }

    // Parse course ID from URL
    const courseMatch = courseUrl.match(/courses\/(\d+)/);
    if (!courseMatch || !courseMatch[1]) {
      return { error: "Could not parse the Canvas course ID from the URL." };
    }
    const courseId = courseMatch[1];

    // Fetch assignments and filter to published ones
    const briefs = await listAssignmentBriefsWithDue(resolved.baseUrl, resolved.token, resolved.institution, courseId);
    const assignments = briefs
      .filter((b) => b.published !== false)
      .map((b) => ({ assignmentId: b.assignmentId, name: b.name, dueAt: b.dueAt }));

    return { assignments, institution: resolved.institution.code };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load assignment due dates." };
  }
}

export async function pullSubmissionAction(
  code: string,
  courseId: string,
  assignmentId: string,
  userId: number
): Promise<{ submission: CanvasSubmissionDetail } | { error: string }> {
  try {
    await requireOwner();
    return { submission: await fetchSubmissionDetail(code.trim().toUpperCase(), courseId, assignmentId, userId) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not pull the submission." };
  }
}

/** Grade a single pulled-back submission, reusing the main grader. Returns a
 *  one-row run plus the assignment URL so the results table can post back. */
export async function gradeOneSubmissionAction(
  code: string,
  courseId: string,
  assignmentId: string,
  userId: number,
  provider: LlmProvider = "gemini"
): Promise<{ run: GradingRun; canvasUrl: string } | { error: string }> {
  try {
    await requireOwner();
    const c = code.trim().toUpperCase();
    const submission = await fetchSubmissionDetail(c, courseId, assignmentId, userId);
    const meta = await fetchCanvasMeta(submission.canvasUrl);
    const instructions = meta.description || submission.assignmentName;

    const work: CanvasStudentWork = {
      student: submission.student,
      userId: submission.userId,
      text: submission.text,
      files: submission.files,
      contributionCount: Math.max(1, submission.files.length + (submission.text ? 1 : 0)),
    };
    const entry = await canvasWorkToEntry(work);
    const speedGraderUrl = await getSpeedGraderUrl(submission.canvasUrl);
    // The external "other" engine needs a zip; fall back to gemini for a single submission.
    const gradeProvider: LlmProvider = provider === "other" ? "gemini" : provider;

    let run: GradingRun;
    if (gradeProvider === "embedded") {
      const builtRubric = buildEmbeddedRubric({ rubricText: meta.rubricText, instructions });
      if (builtRubric.checks.length === 0) {
        return { error: "No rubric or instructions were available to grade this with the deterministic engine." };
      }
      await attachCodeRuns([entry]);
      run = gradeEntriesEmbedded([entry], builtRubric, submission.pointsPossible);
    } else {
      const effectiveRubric = meta.rubricText.trim()
        ? meta.rubricText
        : await generateRubric(instructions, gradeProvider);
      run = await gradeEntries([entry], instructions, effectiveRubric, gradeProvider, submission.pointsPossible);
    }

    return { run: { ...run, speedGraderUrl }, canvasUrl: submission.canvasUrl };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not grade the submission." };
  }
}

export async function generateModelAnswerAction(
  instructions: string,
  rubric: string,
  provider: LlmProvider = "gemini",
  moduleContext: string = ""
): Promise<{ modelAnswer: string } | { error: string }> {
  try {
    await requireOwner();
    if (!instructions.trim()) return { error: "Provide the assignment instructions." };
    const answer = await generateSampleAnswer(instructions, rubric, provider, moduleContext);
    return { modelAnswer: typeof answer === "string" ? answer : String(answer) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate a model answer." };
  }
}

export async function listAnnouncementsAction(
  courseUrl: string,
  acronym?: string
): Promise<{ courseName: string; announcements: CanvasAnnouncement[] } | { error: string }> {
  try {
    await requireOwner();
    const [courseName, announcements] = await Promise.all([
      getCourseName(courseUrl, acronym),
      listAnnouncements(courseUrl, acronym),
    ]);
    return { courseName, announcements };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load announcements." };
  }
}

/** Post a new announcement to the course. */
export async function createAnnouncementAction(
  courseUrl: string,
  title: string,
  message: string,
  acronym?: string,
  // ISO 8601 time to schedule visibility; omit/empty to post immediately.
  delayedPostAt?: string
): Promise<{ announcement: CanvasAnnouncement } | { error: string }> {
  try {
    await requireOwner();
    const announcement = await createAnnouncement(courseUrl, title, message, acronym, delayedPostAt);
    return { announcement };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not post the announcement." };
  }
}

/** List courses by institution and term. */
export async function listCoursesByTermAction(
  institution: string,
  term: string
): Promise<
  | {
      courses: Array<{
        id: string;
        name: string;
        courseCode: string | null;
        termName: string | null;
        startAt: string | null;
      }>;
    }
  | { error: string }
> {
  try {
    await requireOwner();
    if (!institution.trim()) {
      return { error: "Enter an institution." };
    }
    const courses = await listCoursesByTerm(institution.trim().toUpperCase(), term);
    return { courses };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list the term's courses." };
  }
}

/** Create a scheduled announcement in a course. */
export async function createScheduledAnnouncementAction(
  courseUrl: string,
  title: string,
  message: string,
  delayedPostAt: string | null,
  acronym?: string
): Promise<{ id: number } | { error: string }> {
  try {
    await requireOwner();
    if (!title.trim()) return { error: "An announcement needs a title." };
    if (!message.trim()) return { error: "An announcement needs a message." };
    const announcement = await createAnnouncement(courseUrl, title, message, acronym, delayedPostAt);
    return { id: announcement.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the announcement." };
  }
}

/** Generate a lecture deck with slides and announcement from course materials. */
export async function generateLectureFromMaterialsAction(
  courseName: string,
  moduleName: string,
  materialsText: string,
  provider: LlmProvider = "gemini"
): Promise<
  | { presentationTitle: string; slides: SlideData[]; announcement: string }
  | { error: string }
> {
  try {
    await requireOwner();
    const truncated = materialsText.slice(0, 24000);

    // Embedded Deterministic Engine: template a deck outline from the
    // materials (scaffoldLessonPlan never errors), with a plain announcement
    // derived from the slide titles.
    if (provider === "embedded") {
      const scaffold = await scaffoldLessonPlan(truncated);
      const announcement =
        "This lecture covers: " +
        scaffold.slides.map((s) => s.title).join("; ") +
        ". Review the slides and bring questions to class.";
      return {
        presentationTitle: scaffold.presentationTitle,
        slides: scaffold.slides,
        announcement,
      };
    }

    const prompt = `You are an expert lecturer preparing course materials. Given the following module materials, produce a complete lecture presentation with slides and an announcement for students. The slides must be fully self-contained - students reading them after class must be able to understand every concept without relying on any verbal explanation from the instructor.

MODULE: ${moduleName}
COURSE: ${courseName}

MATERIALS:
${truncated}

Cover every concept the materials introduce; the structure requirements below determine the slide count.

Return ONLY valid JSON matching this structure, plus an "announcement" field:
${slideDeckJsonShapeWith('"announcement": "2-3 short paragraphs of plain text summarizing the lecture for students"')}

Requirements:
${SLIDE_STRUCTURE_REQUIREMENTS}

Announcement requirements:
- 2-3 short paragraphs of plain text (no HTML or markdown).
- Summarize the key topics and learning objectives.
- Invite questions and next steps.`;

    let parsed: {
      presentationTitle?: string;
      slides?: Array<{ title?: string; bullets?: string[]; code?: string; codeLanguage?: string }>;
      announcement?: string;
    } | null = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      const result = await callLlm(
        {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.6, maxOutputTokens: 12288 },
        },
        provider
      );

      if (!result.ok) {
        return {
          error: `LLM API error for "${moduleName}": HTTP ${result.status} — ${result.body.slice(0, 200)}`,
        };
      }

      const jsonText = jsonObjectSlice(result.text);
      if (!jsonText) {
        if (attempt === 1) {
          console.error(`Lecture JSON parse failed for "${moduleName}" (attempt 1): no JSON object in the response`);
          continue;
        }
        return { error: `Could not parse the lecture from the model output. Try again.` };
      }

      try {
        parsed = JSON.parse(jsonText) as {
          presentationTitle?: string;
          slides?: Array<{ title?: string; bullets?: string[]; code?: string; codeLanguage?: string }>;
          announcement?: string;
        };
        break;
      } catch (err) {
        if (attempt === 1) {
          console.error(
            `Lecture JSON parse failed for "${moduleName}" (attempt 1): ${err instanceof Error ? err.message : String(err)}`
          );
          continue;
        }
        return { error: `Could not parse the lecture from the model output. Try again.` };
      }
    }

    if (!parsed) {
      return { error: `Could not parse the lecture from the model output. Try again.` };
    }

    if (!parsed.slides || !Array.isArray(parsed.slides)) {
      return { error: `Model did not return a valid slides array for "${moduleName}".` };
    }

    let slides: SlideData[] = parsed.slides
      .filter((s) => typeof s.title === "string" && Array.isArray(s.bullets))
      .map((s) => toSlideData(s, 4));

    slides = propagateExampleCodeToFollowups(slides);

    return {
      presentationTitle: parsed.presentationTitle ?? `${moduleName} Lecture`,
      slides,
      announcement: parsed.announcement ?? "",
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate the lecture." };
  }
}

/** Regenerate only the recap announcement for a prepared lecture. */
export async function regenerateAnnouncementAction(
  courseName: string,
  moduleName: string,
  materialsText: string,
  previousAnnouncement: string,
  provider: LlmProvider = "gemini"
): Promise<{ announcement: string } | { error: string }> {
  try {
    await requireOwner();
    const truncated = materialsText.slice(0, 24000);

    if (provider === "embedded") {
      return { announcement: previousAnnouncement };
    }

    const prompt = `You are an expert lecturer. Given the following module materials and the previous draft announcement, write a NEW, improved 2-3 short paragraph plain-text announcement for students that is clearly different in wording and structure from the previous draft.

MODULE: ${moduleName}
COURSE: ${courseName}

MATERIALS:
${truncated}

PREVIOUS DRAFT:
${previousAnnouncement}

Return ONLY valid JSON: { "announcement": "..." }`;

    let parsed: { announcement?: string } | null = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      const result = await callLlm(
        {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
        },
        provider
      );

      if (!result.ok) {
        return {
          error: `LLM API error for "${moduleName}": HTTP ${result.status}`,
        };
      }

      const jsonText = jsonObjectSlice(result.text);
      if (!jsonText) {
        if (attempt === 1) {
          console.error(`Announcement regeneration JSON parse failed for "${moduleName}" (attempt 1)`);
          continue;
        }
        return { error: `Could not parse the announcement from the model output.` };
      }

      try {
        parsed = JSON.parse(jsonText) as { announcement?: string };
        break;
      } catch (err) {
        if (attempt === 1) {
          console.error(
            `Announcement regeneration JSON parse failed for "${moduleName}" (attempt 1): ${err instanceof Error ? err.message : String(err)}`
          );
          continue;
        }
        return { error: `Could not parse the announcement from the model output.` };
      }
    }

    if (!parsed || !parsed.announcement || typeof parsed.announcement !== "string" || !parsed.announcement.trim()) {
      return { error: "Generated announcement is empty. Try again." };
    }

    return { announcement: parsed.announcement };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not regenerate the announcement." };
  }
}

/**
 * Anticipate the questions students are likely to ask during a lecture and
 * draft instructor-ready answers. Module materials arrive as gathered text;
 * optional slide uploads arrive base64 and are text-extracted server-side.
 */
export async function generateLectureQaAction(
  courseName: string,
  moduleName: string,
  materialsText: string,
  slideFiles: Array<{ name: string; base64: string }>,
  provider: LlmProvider = "gemini"
): Promise<{ questions: Array<{ question: string; answer: string }> } | { error: string }> {
  try {
    await requireOwner();

    let slidesText = "";
    for (const file of slideFiles.slice(0, 3)) {
      try {
        const text = await extractTextFromBuffer(file.name, Buffer.from(file.base64, "base64"));
        if (text && text.trim()) {
          slidesText += `\n# Slides: ${file.name}\n${text.trim()}\n`;
        }
      } catch (err) {
        console.error(
          `Slide text extraction failed for "${file.name}": ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    const materials = materialsText.slice(0, 20000);
    const slides = slidesText.slice(0, 16000);

    // Embedded Deterministic Engine: template questions from the material
    // headings so the step never errors without an LLM provider. Falls back
    // to sentence/phrase fragments when the text has no heading-sized lines
    // (e.g. a tile's topics field pasted as one long paragraph).
    if (provider === "embedded") {
      const combined = materials + "\n" + slides;
      let topics = [
        ...new Set(
          combined
            .split("\n")
            .map((l) => l.replace(/^#+\s*/, "").trim())
            .filter((l) => l.length > 3 && l.length < 80)
        ),
      ];
      if (topics.length === 0) {
        topics = [
          ...new Set(
            combined
              .split(/[.;,\n]+/)
              .map((l) => l.trim())
              .filter((l) => l.length > 3 && l.length < 80)
          ),
        ];
      }
      const questions = topics.slice(0, 10).map((topic) => ({
        question: `Can you walk through "${topic}" one more time with an example?`,
        answer: `Revisit the ${topic} material step by step, work one concrete example on the board, and point students to the matching module resource for practice.`,
      }));
      if (questions.length === 0) {
        return { error: "Not enough material to anticipate questions. Add module materials or slides." };
      }
      return { questions };
    }

    const prompt = `You are an experienced instructor preparing for a lecture. Based on the module materials${slides ? " and the actual lecture slides" : ""} below, anticipate the questions students are most likely to ask DURING this lecture, and write a clear, instructor-ready answer for each.

COURSE: ${courseName}
MODULE: ${moduleName}

MATERIALS:
${materials}
${slides ? `\nLECTURE SLIDES:\n${slides}\n` : ""}
Requirements:
- 10 to 16 questions, phrased the way a student would actually ask them (confusions, edge cases, "why does...", "what happens if...", practical concerns like grading or tooling).
- Order them roughly in the order the topics come up in the lecture.
- Each answer is 2-5 sentences, concrete and self-contained, written so the instructor can deliver it verbatim.
- Include at least one question about how the topic connects to the assignment or assessment when the materials mention one.

Return ONLY valid JSON matching this structure:
{ "questions": [ { "question": "string", "answer": "string" } ] }`;

    let parsed: { questions?: Array<{ question?: string; answer?: string }> } | null = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      const result = await callLlm(
        {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.6, maxOutputTokens: 8192 },
        },
        provider
      );

      if (!result.ok) {
        return {
          error: `LLM API error for "${moduleName}": HTTP ${result.status} — ${result.body.slice(0, 200)}`,
        };
      }

      const jsonText = jsonObjectSlice(result.text);
      if (!jsonText) {
        if (attempt === 1) {
          console.error(`Lecture Q&A JSON parse failed for "${moduleName}" (attempt 1): no JSON object in the response`);
          continue;
        }
        return { error: "Could not parse the Q&A from the model output. Try again." };
      }

      try {
        parsed = JSON.parse(jsonText) as { questions?: Array<{ question?: string; answer?: string }> };
        break;
      } catch (err) {
        if (attempt === 1) {
          console.error(
            `Lecture Q&A JSON parse failed for "${moduleName}" (attempt 1): ${err instanceof Error ? err.message : String(err)}`
          );
          continue;
        }
        return { error: "Could not parse the Q&A from the model output. Try again." };
      }
    }

    if (!parsed || !Array.isArray(parsed.questions)) {
      return { error: `Model did not return a valid questions array for "${moduleName}".` };
    }

    const questions = parsed.questions
      .filter(
        (q): q is { question: string; answer: string } =>
          typeof q.question === "string" &&
          q.question.trim() !== "" &&
          typeof q.answer === "string" &&
          q.answer.trim() !== ""
      )
      .map((q) => ({ question: q.question.trim(), answer: q.answer.trim() }));

    return { questions };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate the lecture Q&A." };
  }
}

/** Analyze multiple courses for emerging technology opportunities and integration recommendations. */
export async function analyzeCourseTechAction(
  courses: Array<{
    name: string;
    topics: string;
    syllabusText: string;
    textbook: string;
    repoDigest: string;
    modulesSummary: string;
    assignmentsSummary: string;
  }>,
  provider: LlmProvider = "gemini"
): Promise<{ reports: Array<{ name: string; report: string }> } | { error: string }> {
  try {
    await requireOwner();
    if (courses.length === 0) {
      return { error: "Pick at least one course." };
    }

    const ANALYSIS_CONCURRENCY = 2;
    const reports = await mapWithConcurrency(courses, ANALYSIS_CONCURRENCY, async (course) => {
      const prompt = `You are an expert in CS and technology education. Analyze this course and provide actionable guidance on emerging technologies and integration strategies.

COURSE: ${course.name}
TOPICS: ${course.topics.slice(0, 4000)}
SYLLABUS: ${course.syllabusText.slice(0, 4000)}
TEXTBOOK/MATERIALS: ${course.textbook.slice(0, 4000)}
CODE REPOSITORY: ${course.repoDigest.slice(0, 4000)}
MODULES: ${course.modulesSummary.slice(0, 4000)}
ASSIGNMENTS: ${course.assignmentsSummary.slice(0, 4000)}

Provide a plain-text report with exactly two headed sections:

1. EMERGING TECHNOLOGY OPPORTUNITIES
   - List specific technologies/tools now relevant to students of this subject.
   - For each, explain in one line why it matters for this course's students.

2. INTEGRATION RECOMMENDATIONS
   - Provide concrete, course-specific ways to fold each technology into modules or assignments.
   - Be practical and specific to the content you reviewed above.

Return only the plain-text report with these two sections. No JSON, no markdown formatting, no code fences.`;

      const result = await callLlm(
        {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
        },
        provider
      );

      if (!result.ok) {
        return {
          name: course.name,
          report: `Analysis failed: HTTP ${result.status}`,
        };
      }

      return {
        name: course.name,
        report: result.text.trim(),
      };
    });

    return { reports };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not analyze the courses." };
  }
}

/** List the account Inbox conversations for the selected institution (or default). */
export async function listConversationsAction(
  acronym?: string
): Promise<{ conversations: CanvasConversationSummary[] } | { error: string }> {
  try {
    await requireOwner();
    return { conversations: await listConversations(acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the inbox." };
  }
}

/** Fetch one conversation's full thread. */
export async function getConversationAction(
  id: number,
  acronym?: string
): Promise<{ conversation: CanvasConversationDetail } | { error: string }> {
  try {
    await requireOwner();
    return { conversation: await getConversation(id, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the conversation." };
  }
}

/** Reply to a conversation, then return its refreshed thread. */
export async function replyToConversationAction(
  id: number,
  body: string,
  acronym?: string
): Promise<{ conversation: CanvasConversationDetail } | { error: string }> {
  try {
    await requireOwner();
    await replyToConversation(id, body, acronym);
    return { conversation: await getConversation(id, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not send the reply." };
  }
}

/** Mark a conversation read/unread or archive it. */
export async function setConversationStateAction(
  id: number,
  state: "read" | "unread" | "archived",
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await setConversationWorkflowState(id, state, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the conversation." };
  }
}

// ── Course Content (modules & pages) ─────────────────────────────────────────
//
// Owner-gated wrappers over the Canvas Modules/Pages API. Reads power the Course
// Content tab; writes mutate live course content, so the UI keeps every write
// explicit (staged locally, saved on an explicit click) and these actions simply
// pass the author's confirmed changes through.

/** Load a course's name, modules (with items), and wiki page list in one call. */
export async function listCourseContentAction(
  courseUrl: string,
  acronym?: string
): Promise<{ courseName: string; modules: CanvasModule[]; pages: CanvasPageSummary[] } | { error: string }> {
  try {
    await requireOwner();
    const [courseName, modules, pages] = await Promise.all([
      getCourseName(courseUrl, acronym),
      listModules(courseUrl, acronym),
      listPages(courseUrl, acronym),
    ]);
    return { courseName, modules, pages };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load course content." };
  }
}

/**
 * Upload a generated syllabus (.docx, base64) into a course and add it to a
 * module at `position` (1-based; omit for the end).
 */
export async function placeSyllabusInModuleAction(
  base64: string,
  courseUrl: string,
  moduleId: number,
  fileName: string,
  position?: number,
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    await uploadFileToModule(courseUrl, base64, fileName, DOCX, moduleId, position, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not add the syllabus to Canvas." };
  }
}

// ── File upload + bulk edit ──────────────────────────────────────────────────

type BulkActionResult = { updated: number; failures: Array<{ id: string; error: string }> };

/** Step 1 of a Canvas file upload: get a pre-signed upload ticket for the browser. */
export async function requestFileUploadAction(
  courseUrl: string,
  file: { name: string; size: number; contentType?: string; folderPath?: string },
  acronym?: string
): Promise<{ ticket: FileUploadTicket } | { error: string }> {
  try {
    await requireOwner();
    return { ticket: await requestFileUpload(courseUrl, file, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start the upload." };
  }
}

/** List the course's files (Files subtab). */
export async function listCourseFilesAction(
  courseUrl: string,
  acronym?: string
): Promise<{ files: CourseFile[] } | { error: string }> {
  try {
    await requireOwner();
    return { files: await listCourseFiles(courseUrl, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the files." };
  }
}

/** Rename a course file. */
export async function renameCourseFileAction(
  courseUrl: string,
  fileId: number,
  name: string,
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await renameCourseFile(courseUrl, fileId, name, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not rename the file." };
  }
}

/** Delete a course file. */
export async function deleteCourseFileAction(
  courseUrl: string,
  fileId: number,
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await deleteCourseFile(courseUrl, fileId, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the file." };
  }
}

/** Start a course-copy migration (export to / import from another course). */
export async function createCourseCopyAction(
  contextCourseUrl: string,
  destCourseId: string,
  sourceCourseId: string,
  selective: boolean,
  acronym?: string
): Promise<{ migrationId: number; state: string } | { error: string }> {
  try {
    await requireOwner();
    return await createCourseCopy(contextCourseUrl, destCourseId, sourceCourseId, selective, acronym);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start the copy." };
  }
}

/** Poll a content migration's workflow state. */
export async function getMigrationStateAction(
  contextCourseUrl: string,
  destCourseId: string,
  migrationId: number,
  acronym?: string
): Promise<{ state: string } | { error: string }> {
  try {
    await requireOwner();
    return { state: await getMigrationState(contextCourseUrl, destCourseId, migrationId, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not check the copy status." };
  }
}

/** Submit the chosen content types to a migration waiting for selection. */
export async function selectCopyTypesAction(
  contextCourseUrl: string,
  destCourseId: string,
  migrationId: number,
  types: string[],
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await selectCopyTypes(contextCourseUrl, destCourseId, migrationId, types, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not submit the selection." };
  }
}

/** Fetch the selectable-content tree for per-item copy. */
export async function getSelectiveDataAction(
  contextCourseUrl: string,
  destCourseId: string,
  migrationId: number,
  acronym?: string
): Promise<{ nodes: SelectiveNode[] } | { error: string }> {
  try {
    await requireOwner();
    return { nodes: await getSelectiveData(contextCourseUrl, destCourseId, migrationId, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the items to copy." };
  }
}

/** Submit the chosen individual items to a migration waiting for selection. */
export async function submitSelectiveImportAction(
  contextCourseUrl: string,
  destCourseId: string,
  migrationId: number,
  properties: string[],
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await submitSelectiveImport(contextCourseUrl, destCourseId, migrationId, properties, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not submit the selection." };
  }
}

/** Attach an already-uploaded Canvas file to a module as a File item. */
export async function addFileToModuleAction(
  courseUrl: string,
  moduleId: number,
  fileId: number,
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await createModuleItem(courseUrl, moduleId, { type: "File", contentId: fileId }, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not add the file to the module." };
  }
}

/** List items of one kind (with published/due/points) for the bulk editor. */
export async function listBulkItemsAction(
  courseUrl: string,
  kind: BulkKind,
  acronym?: string
): Promise<{ items: BulkItem[] } | { error: string }> {
  try {
    await requireOwner();
    return { items: await listBulkItems(courseUrl, kind, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load items." };
  }
}

/** Bulk-set published and/or points possible on selected items of one kind. */
export async function bulkUpdateAction(
  courseUrl: string,
  kind: BulkKind,
  ids: string[],
  fields: { published?: boolean; pointsPossible?: number; submissionType?: string },
  acronym?: string
): Promise<BulkActionResult | { error: string }> {
  try {
    await requireOwner();
    return await bulkUpdate(courseUrl, kind, ids, fields, acronym);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the items." };
  }
}

/** Bulk-delete selected items of one kind. */
export async function bulkDeleteAction(
  courseUrl: string,
  kind: BulkKind,
  ids: string[],
  acronym?: string
): Promise<BulkActionResult | { error: string }> {
  try {
    await requireOwner();
    return await bulkDelete(courseUrl, kind, ids, acronym);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the items." };
  }
}

/** List the course's grading rubrics (for bulk association). */
export async function listRubricsAction(
  courseUrl: string,
  acronym?: string
): Promise<{ rubrics: CanvasRubric[] } | { error: string }> {
  try {
    await requireOwner();
    return { rubrics: await listRubrics(courseUrl, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load rubrics." };
  }
}

/** Attach a rubric to many assignments. */
export async function bulkAssociateRubricAction(
  courseUrl: string,
  rubricId: number,
  assignmentIds: string[],
  acronym?: string
): Promise<BulkActionResult | { error: string }> {
  try {
    await requireOwner();
    return await bulkAssociateRubric(courseUrl, rubricId, assignmentIds, acronym);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not associate the rubric." };
  }
}

/** Create a rubric (optionally associating it to one assignment in the same call). */
export async function createRubricAction(
  courseUrl: string,
  input: {
    title: string;
    criteria: RubricCriterionInput[];
    associateAssignmentId?: number;
    useForGrading?: boolean;
  },
  acronym?: string
): Promise<{ rubric: { id: number; title: string } } | { error: string }> {
  try {
    await requireOwner();
    return { rubric: await createRubric(courseUrl, input, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the rubric." };
  }
}

/** Fetch one rubric (criteria + tiers) for editing. */
export async function getRubricAction(
  courseUrl: string,
  rubricId: number,
  acronym?: string
): Promise<{ rubric: RubricDetail } | { error: string }> {
  try {
    await requireOwner();
    return { rubric: await getRubric(courseUrl, rubricId, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the rubric." };
  }
}

/** Update an existing rubric in place. */
export async function updateRubricAction(
  courseUrl: string,
  rubricId: number,
  input: { title: string; criteria: RubricCriterionInput[] },
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await updateRubric(courseUrl, rubricId, input, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the rubric." };
  }
}

/** List a classic quiz's questions for the quiz editor. */
export async function listQuizQuestionsAction(
  courseUrl: string,
  quizId: number,
  acronym?: string
): Promise<{ questions: QuizQuestion[] } | { error: string }> {
  try {
    await requireOwner();
    return { questions: await listQuizQuestions(courseUrl, quizId, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the quiz questions." };
  }
}

/** Add a question to a quiz. */
export async function createQuizQuestionAction(
  courseUrl: string,
  quizId: number,
  question: QuizQuestionInput,
  acronym?: string
): Promise<{ question: QuizQuestion } | { error: string }> {
  try {
    await requireOwner();
    return { question: await createQuizQuestion(courseUrl, quizId, question, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not add the question." };
  }
}

/** Update one quiz question. */
export async function updateQuizQuestionAction(
  courseUrl: string,
  quizId: number,
  questionId: number,
  question: QuizQuestionInput,
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await updateQuizQuestion(courseUrl, quizId, questionId, question, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the question." };
  }
}

/** Delete one quiz question. */
export async function deleteQuizQuestionAction(
  courseUrl: string,
  quizId: number,
  questionId: number,
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await deleteQuizQuestion(courseUrl, quizId, questionId, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the question." };
  }
}

/** Apply a batch of due-date changes to module items (the cascade scheduler). */
export async function setModuleDueDatesAction(
  courseUrl: string,
  updates: DueDateUpdate[],
  acronym?: string
): Promise<{ updated: number; failures: Array<{ contentId: number; error: string }> } | { error: string }> {
  try {
    await requireOwner();
    return await setDueDates(courseUrl, updates, acronym);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update due dates." };
  }
}

/** Fetch one assignment/quiz/discussion's title + description for inline editing. */
export async function getGradableAction(
  courseUrl: string,
  kind: GradableKind,
  contentId: number,
  acronym?: string
): Promise<{ detail: GradableDetail } | { error: string }> {
  try {
    await requireOwner();
    return { detail: await getGradable(courseUrl, kind, contentId, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the item." };
  }
}

/** Update one assignment/quiz/discussion's title, description, and/or points. */
export async function updateGradableAction(
  courseUrl: string,
  kind: GradableKind,
  contentId: number,
  fields: { title?: string; description?: string; pointsPossible?: number; submissionType?: string },
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await updateGradable(courseUrl, kind, contentId, fields, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the item." };
  }
}

/** Load a docx/pptx file's editable paragraphs from a module File item. */
export async function getOfficeEditableAction(
  courseUrl: string,
  fileId: number,
  acronym?: string
): Promise<{ name: string; kind: OfficeKind; paragraphs: OfficeParagraph[] } | { error: string }> {
  try {
    await requireOwner();
    return await getOfficeEditable(courseUrl, fileId, acronym);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not open the file for editing." };
  }
}

/** List the course's .docx files a section can be moved into (excludes none). */
export async function listMovableFilesAction(
  courseUrl: string,
  acronym?: string
): Promise<{ files: Array<{ id: number; title: string }> } | { error: string }> {
  try {
    await requireOwner();
    const files = (await listScannableFiles(courseUrl, acronym))
      .filter((f) => f.kind === "docx")
      .map((f) => ({ id: f.id, title: f.title }));
    return { files };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list files." };
  }
}

/** Append a section (spans + style) to the end of another .docx file in Canvas. */
export async function appendOfficeParagraphAction(
  courseUrl: string,
  fileId: number,
  spans: RunSpan[],
  style: string,
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await appendOfficeParagraph(courseUrl, fileId, spans, style, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not move the section." };
  }
}

/** Apply paragraph edits to a docx/pptx file and overwrite it in Canvas. */
export async function saveOfficeEditsAction(
  courseUrl: string,
  fileId: number,
  sections: Array<{ sourceId: string; spans: RunSpan[]; style?: string }>,
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await saveOfficeEdits(courseUrl, fileId, sections, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the file to Canvas." };
  }
}

// ── Accessibility remediation (scans run in /api/accessibility) ─────────────


/** List an Office file's images + current alt text (for the alt remediation editor). */
export async function getOfficeFileImagesAction(
  courseUrl: string,
  fileId: number,
  acronym?: string
): Promise<{ images: Array<OfficeImage & { mimeType?: string; base64?: string }> } | { error: string }> {
  try {
    await requireOwner();
    return { images: await getOfficeFileImagesWithData(courseUrl, fileId, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read the file." };
  }
}

// Ask a vision model for alt text for one image's bytes; "" on failure/empty.
async function generateImageAlt(mimeType: string, base64: string, provider: LlmProvider): Promise<string> {
  const result = await callLlm(
    {
      contents: [
        {
          role: "user",
          parts: [
            { text: "Write concise, descriptive alt text (under 125 characters) for this image, for screen-reader users. Describe its content or purpose. Do not start with \"image of\" or \"picture of\". Return ONLY the alt text, no quotes." },
            { inlineData: { mimeType, data: base64 } },
          ],
        },
      ],
      generationConfig: { temperature: 0.4, maxOutputTokens: 120 },
    },
    provider
  );
  if (!result.ok) return "";
  return result.text.trim().replace(/^["']|["']$/g, "").slice(0, 200);
}

/** Suggest alt text for one Office-file image by sending it to a vision model. */
export async function suggestOfficeImageAltAction(
  courseUrl: string,
  fileId: number,
  imageId: string,
  acronym?: string,
  provider: LlmProvider = "gemini"
): Promise<{ text: string } | { error: string }> {
  try {
    await requireOwner();
    // Embedded Deterministic Engine: alt text needs to see the image; there is no
    // file name here, only pixels, so ask the instructor to switch providers.
    if (provider === "embedded") {
      return { error: "The embedded engine can't analyze image contents. Switch to an LLM provider to suggest alt text." };
    }
    const image = await getOfficeFileImageData(courseUrl, fileId, imageId, acronym);
    if (!image) return { error: "This image can't be previewed for a suggestion (e.g. a vector image)." };
    const text = await generateImageAlt(image.mimeType, image.base64, provider);
    return text ? { text } : { error: "The model returned empty text." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/** Write alt text onto an Office file's images and overwrite it in Canvas. */
export async function saveOfficeImageAltAction(
  courseUrl: string,
  fileId: number,
  edits: Record<string, string>,
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await saveOfficeFileImageAlt(courseUrl, fileId, edits, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the file to Canvas." };
  }
}

/**
 * Headless "fix everything" for one Office file: AI alt text for images that
 * lack it, plus (docx) a title from the file name and heuristic heading styles.
 * Applies all of it in one Canvas save and returns the issues that remain, so
 * the review pane can update without opening an editor.
 */
export async function autoFixOfficeFileAction(
  courseUrl: string,
  fileId: number,
  acronym?: string,
  provider: LlmProvider = "gemini"
): Promise<{ issues: Issue[] } | { error: string }> {
  try {
    await requireOwner();

    // AI alt for every image missing it that we can actually render. The embedded
    // engine can't see image contents, so it skips alt text and still applies the
    // deterministic title/heading fixes below.
    const altEdits: Record<string, string> = {};
    if (provider !== "embedded") {
      const images = await getOfficeFileImagesWithData(courseUrl, fileId, acronym);
      for (const im of images) {
        if (im.alt.trim() || !im.base64 || !im.mimeType) continue;
        const alt = await generateImageAlt(im.mimeType, im.base64, provider);
        if (alt) altEdits[im.id] = alt;
      }
    }

    // Title + headings (docx only; getOfficeFileStructure returns null otherwise).
    let title: string | null = null;
    let sections: Array<{ sourceId: string; spans: RunSpan[]; style?: string }> = [];
    const structure = await getOfficeFileStructure(courseUrl, fileId, acronym);
    if (structure) {
      if (!structure.title.trim()) title = titleFromFileName(structure.name);
      const hasHeadings = structure.paragraphs.some((p) => /^Heading[1-9]$/.test(p.style));
      if (!hasHeadings) {
        const levels = suggestHeadingLevels(structure.paragraphs);
        if (Object.keys(levels).length > 0) {
          sections = structure.paragraphs.map((p) => ({
            sourceId: p.id,
            spans: p.runs.length > 0 ? p.runs : [{ text: p.text }],
            style: levels[p.id] ?? p.style,
          }));
        }
      }
    }

    const after = await saveOfficeFileFixes(courseUrl, fileId, { title, sections, altEdits }, acronym);
    return { issues: buildOfficeIssues(after) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not fix the file." };
  }
}

/** Read a PDF's current language + title for the PDF fix editor. */
export async function getPdfMetaAction(
  courseUrl: string,
  fileId: number,
  acronym?: string
): Promise<{ lang: string; title: string } | { error: string }> {
  try {
    await requireOwner();
    return await getPdfMeta(courseUrl, fileId, acronym);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read the file." };
  }
}

/** Set a PDF's language/title, save it to Canvas, and return the issues that remain. */
export async function savePdfAccessibilityAction(
  courseUrl: string,
  fileId: number,
  lang: string,
  title: string,
  acronym?: string
): Promise<{ issues: Issue[] } | { error: string }> {
  try {
    await requireOwner();
    const issues = await savePdfFixes(courseUrl, fileId, { lang, title }, acronym);
    return { issues };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the file to Canvas." };
  }
}

/** Load a docx's title + paragraphs for the document-structure fix editor. */
export async function getOfficeFileStructureAction(
  courseUrl: string,
  fileId: number,
  acronym?: string
): Promise<{ name: string; title: string; paragraphs: OfficeParagraph[] } | { error: string }> {
  try {
    await requireOwner();
    const structure = await getOfficeFileStructure(courseUrl, fileId, acronym);
    if (!structure) return { error: "Only Word (.docx) files have a document title and headings." };
    return structure;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read the file." };
  }
}

/** Set a docx's title and/or heading styles and overwrite it in Canvas. */
export async function saveOfficeFileStructureAction(
  courseUrl: string,
  fileId: number,
  title: string | null,
  sections: Array<{ sourceId: string; spans: RunSpan[]; style?: string }>,
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await saveOfficeFileStructure(courseUrl, fileId, title, sections, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the file to Canvas." };
  }
}


/** Fetch one scannable item's current HTML + title (for the remediation editor). */
export async function getAccessibilityItemHtmlAction(
  courseUrl: string,
  type: AccessibleItemType,
  id: string,
  acronym?: string
): Promise<{ html: string; title: string } | { error: string }> {
  try {
    await requireOwner();
    const item = await getAccessibilityItem(courseUrl, type, id, acronym);
    if (!item) return { error: "Could not load that item." };
    return { html: item.html, title: item.title };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load that item." };
  }
}

/** Save edited HTML back to a scannable item (page/gradable/announcement/syllabus). */
export async function saveAccessibilityItemHtmlAction(
  courseUrl: string,
  type: AccessibleItemType,
  id: string,
  html: string,
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await saveAccessibilityItemHtml(courseUrl, type, id, html, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the item to Canvas." };
  }
}

/** Suggest concise alt text for an image, from its HTML + the item it lives on. */
export async function suggestAltTextAction(
  itemTitle: string,
  snippet: string,
  provider: LlmProvider = "gemini"
): Promise<{ text: string } | { error: string }> {
  try {
    await requireOwner();
    // Embedded Deterministic Engine: derive alt text from the image's file name.
    if (provider === "embedded") {
      const alt = deriveAltTextFromHtml(snippet);
      return alt
        ? { text: alt }
        : { error: "The embedded engine couldn't infer alt text from the image's file name. Switch to an LLM provider for a description." };
    }

    const prompt = `An image on a course item titled "${itemTitle}" needs better alt text for screen-reader users. Here is the image's HTML (use its file name and any context to infer the subject):

${snippet}

Write concise, descriptive alt text under 125 characters that conveys the image's content or purpose. Do not start with "image of" or "picture of". Return ONLY the alt text, with no quotes or commentary.`;
    const result = await callLlm(
      { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 120 } },
      provider
    );
    if (!result.ok) return { error: `Suggestion failed: HTTP ${result.status}` };
    const text = result.text.trim().replace(/^["']|["']$/g, "").slice(0, 200);
    return text ? { text } : { error: "The model returned empty text." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/** Suggest descriptive link text from the link's HTML + the item it lives on. */
export async function suggestLinkTextAction(
  itemTitle: string,
  snippet: string,
  provider: LlmProvider = "gemini"
): Promise<{ text: string } | { error: string }> {
  try {
    await requireOwner();
    // Embedded Deterministic Engine: derive readable link text from the URL.
    if (provider === "embedded") {
      const linkText = deriveLinkTextFromHtml(snippet);
      return linkText
        ? { text: linkText }
        : { error: "The embedded engine couldn't derive link text from the URL. Switch to an LLM provider." };
    }

    const prompt = `A hyperlink on a course item titled "${itemTitle}" has unclear link text (e.g. "click here"). Here is the link's HTML:

${snippet}

Write concise, descriptive link text (a few words) that tells the reader where the link goes, based on its URL. Return ONLY the link text, with no quotes or commentary.`;
    const result = await callLlm(
      { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 60 } },
      provider
    );
    if (!result.ok) return { error: `Suggestion failed: HTTP ${result.status}` };
    const text = result.text.trim().replace(/^["']|["']$/g, "").slice(0, 120);
    return text ? { text } : { error: "The model returned empty text." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}


/** Fetch a Canvas file's previewable contents (base64 for image/PDF, else text). */
export async function previewFileAction(
  courseUrl: string,
  fileId: number,
  acronym?: string
): Promise<{ preview: FilePreview } | { error: string }> {
  try {
    await requireOwner();
    return { preview: await getFilePreview(courseUrl, fileId, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the file." };
  }
}

/** Create a new assignment/quiz/discussion (the target of a change-type). */
export async function createGradableAction(
  courseUrl: string,
  kind: GradableKind,
  fields: { title: string; description?: string; pointsPossible?: number; dueAt?: string | null; submissionType?: string },
  acronym?: string
): Promise<{ id: number } | { error: string }> {
  try {
    await requireOwner();
    return await createGradable(courseUrl, kind, fields, acronym);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the item." };
  }
}

/** List the assignments/quizzes/discussions/files that can be added as items. */
export async function listAddableContentAction(
  courseUrl: string,
  acronym?: string
): Promise<{ content: CanvasAddableContent } | { error: string }> {
  try {
    await requireOwner();
    return { content: await listAddableContent(courseUrl, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load course content options." };
  }
}

/** Fetch a single page's HTML body for editing. */
export async function getPageAction(
  courseUrl: string,
  pageUrl: string,
  acronym?: string
): Promise<{ page: CanvasPage } | { error: string }> {
  try {
    await requireOwner();
    return { page: await getPage(courseUrl, pageUrl, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the page." };
  }
}

/** Save edits to a page (title / HTML body / publish state). */
export async function updatePageAction(
  courseUrl: string,
  pageUrl: string,
  fields: { title?: string; body?: string; published?: boolean },
  acronym?: string
): Promise<{ page: CanvasPage } | { error: string }> {
  try {
    await requireOwner();
    return { page: await updatePage(courseUrl, pageUrl, fields, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the page." };
  }
}

/** Create a new wiki page. */
export async function createPageAction(
  courseUrl: string,
  fields: { title: string; body?: string; published?: boolean },
  acronym?: string
): Promise<{ page: CanvasPage } | { error: string }> {
  try {
    await requireOwner();
    return { page: await createPage(courseUrl, fields, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the page." };
  }
}

/** Publish an opened GitHub code file's contents to a Canvas (LMS) page. */
export async function copyFileToCanvasPageAction(
  courseUrl: string,
  opts: { filePath: string; content: string; title: string; published?: boolean },
  acronym?: string
): Promise<{ page: CanvasPage; htmlUrl: string } | { error: string }> {
  try {
    await requireOwner();
    return await createCodeFilePage(courseUrl, opts, acronym);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not copy the file to a Canvas page." };
  }
}

/** Delete a wiki page. */
export async function deletePageAction(
  courseUrl: string,
  pageUrl: string,
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await deletePage(courseUrl, pageUrl, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the page." };
  }
}

/** Create a new (empty) module. */
export async function createModuleAction(
  courseUrl: string,
  name: string,
  position?: number,
  acronym?: string
): Promise<{ module: CanvasModule } | { error: string }> {
  try {
    await requireOwner();
    return { module: await createModule(courseUrl, name, position, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the module." };
  }
}

/** Update a module's name / publish state / position. */
export async function updateModuleAction(
  courseUrl: string,
  moduleId: number,
  fields: { name?: string; published?: boolean; position?: number },
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await updateModule(courseUrl, moduleId, fields, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the module." };
  }
}

/** Delete a module. */
export async function deleteModuleAction(
  courseUrl: string,
  moduleId: number,
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await deleteModule(courseUrl, moduleId, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the module." };
  }
}

/** Add an item to a module. */
export async function createModuleItemAction(
  courseUrl: string,
  moduleId: number,
  item: NewModuleItem,
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await createModuleItem(courseUrl, moduleId, item, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not add the item." };
  }
}

/** Create a Canvas assignment and optionally add it to a module. */
export async function createCourseAssignmentAction(
  courseUrl: string,
  fields: NewAssignment,
  moduleId: number | null,
  acronym?: string
): Promise<{ id: number; name: string; htmlUrl: string; addedToModule: boolean } | { error: string }> {
  try {
    await requireOwner();
    const created = await createAssignment(courseUrl, fields, acronym);
    let addedToModule = false;
    if (moduleId !== null) {
      await createModuleItem(courseUrl, moduleId, { type: "Assignment", contentId: created.id, title: created.name }, acronym);
      addedToModule = true;
    }
    return { ...created, addedToModule };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the assignment." };
  }
}

/** List the course's assignment groups for the assignment editor. */
export async function listAssignmentGroupsAction(
  courseUrl: string,
  acronym?: string
): Promise<{ groups: Array<{ id: number; name: string }> } | { error: string }> {
  try {
    await requireOwner();
    return { groups: await listAssignmentGroups(courseUrl, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load assignment groups." };
  }
}

/** Draft an assignment description for the LMS editor. */
export async function draftAssignmentDescriptionAction(
  name: string,
  notes: string,
  provider: LlmProvider = "gemini"
): Promise<{ text: string } | { error: string }> {
  try {
    await requireOwner();
    if (!name.trim()) return { error: "Name the assignment first." };
    const parts: LlmPart[] = [
      {
        text: [
          `Write a Canvas assignment description for an assignment named: ${name.trim()}.`,
          notes.trim() ? `Instructor notes to incorporate:\n${notes.trim()}` : "",
          "Structure: one short overview paragraph, then a short list of concrete requirements/steps, then a one-line submission note. Plain text only (no markdown headings, no asterisks) - use blank lines between sections and hyphen bullets. Under 220 words.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ];
    const r = await callLlm(
      { contents: [{ role: "user", parts }], generationConfig: { temperature: 0.5, maxOutputTokens: 1024 } },
      provider
    );
    if (!r.ok || !r.text.trim()) return { error: "The model returned no description." };
    return { text: r.text.trim() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not draft the description." };
  }
}

/** Update a module item's title / indent / publish state / position / module. */
export async function updateModuleItemAction(
  courseUrl: string,
  moduleId: number,
  itemId: number,
  fields: { title?: string; indent?: number; published?: boolean; position?: number; targetModuleId?: number },
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await updateModuleItem(courseUrl, moduleId, itemId, fields, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the item." };
  }
}

/** Remove an item from a module. */
export async function deleteModuleItemAction(
  courseUrl: string,
  moduleId: number,
  itemId: number,
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await deleteModuleItem(courseUrl, moduleId, itemId, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not remove the item." };
  }
}

/**
 * Revise a page's HTML body from a short instruction. Returns revised HTML the
 * author reviews/previews before saving — nothing is written to Canvas here.
 */
export async function revisePageWithAiAction(
  html: string,
  instruction: string,
  provider: LlmProvider = "gemini"
): Promise<{ html: string } | { error: string }> {
  try {
    await requireOwner();
    if (!instruction.trim()) {
      return { error: "Describe what to change first." };
    }

    // Embedded Deterministic Engine: apply concrete edit commands (find/replace,
    // remove an element containing a phrase) by rule; an instruction the engine
    // cannot parse leaves the page unchanged rather than fabricating edits.
    if (provider === "embedded") {
      return { html: applyHtmlRevision(html, instruction).html };
    }

    const prompt = `You are editing the HTML body of a course page in a learning management system (Canvas).

CURRENT PAGE HTML:
${html}

EDIT INSTRUCTION:
${instruction.trim()}

Apply the instruction and return the full, updated page as HTML.

Requirements:
- Return ONLY the HTML for the page body. No markdown fences, no commentary, no <html>/<head>/<body> wrapper.
- Preserve the existing structure, links, images, and formatting except where the instruction calls for a change.
- Use simple, valid HTML (p, h2, h3, ul, ol, li, a, strong, em, table). Do not add inline styles or scripts.
- Do not invent facts, dates, or links that were not present or provided.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Revision failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    // Strip a stray ```html ... ``` fence if the model wraps the output.
    let revised = result.text.trim();
    const fenced = revised.match(/```(?:html)?\s*([\s\S]*?)```/i);
    if (fenced) revised = fenced[1].trim();
    if (!revised) {
      return { error: "The model returned an empty revision." };
    }
    return { html: revised };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/**
 * Generate a course document's content as clean, markdown-ish plain text suited
 * to buildDocxFromPlainText (a "# Title" line, "## Section" headings, "- " bullet
 * lists, and paragraphs). Used by "Add to each" to produce a branded .docx file.
 */
export async function generateDocumentTextAction(
  prompt: string,
  provider: LlmProvider = "gemini"
): Promise<{ text: string } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!prompt.trim()) {
      return { error: "Describe the document to generate first." };
    }

    // Embedded Deterministic Engine: template a markdown document from the prompt
    // with no model call.
    if (provider === "embedded") {
      return { text: scaffoldDocument(prompt) };
    }

    const styleBlock = await getWritingStyleBlock(user.id);

    const llmPrompt = `You are writing a polished course handout/document for students.

TOPIC / INSTRUCTION:
${prompt.trim()}

Write the document as clean plain text using this lightweight markdown:
- The first line is the document title, prefixed with a single "# ".
- Major sections use "## " headings.
- Use "- " for bullet points.
- Separate paragraphs with a blank line.

Requirements:
- Return ONLY the document text. No code fences, no commentary, no HTML.
- Be clear, well-organized, and professional.
- Do not invent specific facts, dates, names, or links that were not provided.${styleBlock}`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: llmPrompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Generation failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    // Strip a stray ``` fence if the model wraps the output.
    let text = result.text.trim();
    const fenced = text.match(/```(?:markdown|md|text)?\s*([\s\S]*?)```/i);
    if (fenced) text = fenced[1].trim();
    if (!text) {
      return { error: "The model returned an empty document." };
    }
    return { text };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/**
 * Generate a slide deck (title + content slides with bullets) as structured data
 * for buildSlidesPptx. Used by "Add to each" to produce a branded .pptx file.
 */
export async function generateSlidesAction(
  prompt: string,
  provider: LlmProvider = "gemini"
): Promise<{ presentationTitle: string; slides: Array<{ title: string; bullets: string[] }> } | { error: string }> {
  try {
    await requireOwner();
    if (!prompt.trim()) {
      return { error: "Describe the slides to generate first." };
    }

    // Embedded Deterministic Engine: template a deck outline from the prompt with
    // no model call.
    if (provider === "embedded") {
      return scaffoldLessonPlan(prompt);
    }

    const llmPrompt = `You are an expert educator creating a clear, professional slide deck for students.

TOPIC / INSTRUCTION:
${prompt.trim()}

Return ONLY valid JSON in this shape:
{
  "presentationTitle": "...",
  "slides": [
    { "title": "...", "bullets": ["...", "..."] }
  ]
}

Requirements:
- 5-12 content slides, each with a short title and 3-6 concise bullet points.
- Clear, well-organized, and professional.
- Do not invent specific facts, dates, names, or links that were not provided.
- If the deck teaches concepts, append these closing slides at the very END, in order: (a) 2-3 slides whose "title" begins with "Additional Practice:" posing review questions on the material, each immediately followed by an "Answer:" slide with the solution; (b) a slide whose "title" begins with "Documentation:" that recaps the key concepts and terms as a study reference; (c) a slide titled "Documentation & References" that names authoritative resources / official documentation for the tools or topics mentioned. Name only well-known resources; do not invent specific URLs or facts.
- Do not include any text outside the JSON object.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: llmPrompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Slide generation failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const jsonText = jsonObjectSlice(result.text);
    if (!jsonText) {
      return { error: "Could not parse slide data from the model response." };
    }

    let parsed: { presentationTitle?: unknown; slides?: unknown };
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return { error: "The model returned invalid slide JSON." };
    }

    const presentationTitle = typeof parsed.presentationTitle === "string" ? parsed.presentationTitle.trim() : "";
    const slides = (Array.isArray(parsed.slides) ? parsed.slides : [])
      .map((s) => {
        const obj = (s ?? {}) as { title?: unknown; bullets?: unknown };
        const title = typeof obj.title === "string" ? obj.title.trim() : "";
        const bullets = Array.isArray(obj.bullets)
          ? obj.bullets.filter((b): b is string => typeof b === "string" && b.trim() !== "").map((b) => b.trim())
          : [];
        return { title, bullets };
      })
      .filter((s) => s.title || s.bullets.length > 0);

    if (slides.length === 0) {
      return { error: "The model returned no slides." };
    }
    return { presentationTitle: presentationTitle || "Presentation", slides };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

// ── Adapt an existing syllabus from a codebase ──────────────────────────────

/** One class-specific paragraph of a syllabus the instructor should fill in. */
export interface SyllabusInputField {
  /** The paragraph id (matches parseOfficeParagraphs) to rewrite. */
  paragraphId: string;
  /** Short human label for the input. */
  label: string;
  /** The paragraph's current text in the uploaded syllabus. */
  currentText: string;
  /** AI-suggested replacement text for this offering. */
  suggestedText: string;
}

/** Instructor-provided facts the codebase can't supply; not assumed across syllabi. */
export interface SyllabusCourseInfo {
  /** Course name/title, e.g. "Database Management". */
  courseName?: string;
  /** Course code/number, e.g. "BIT270". */
  courseCode?: string;
  /** Instructor name. */
  instructorName?: string;
  /** Instructor email. */
  instructorEmail?: string;
  /** Official course description (use verbatim for the description section). */
  courseDescription?: string;
  /** Course start date including the year, e.g. "2026-08-25". */
  startDate?: string;
  /** Meeting days, e.g. "Mon/Wed/Fri". */
  meetingDays?: string;
  /** Meeting times, e.g. "9:00–10:15am". */
  meetingTimes?: string;
  /** Meeting location, e.g. "Room 204, Science Hall". */
  location?: string;
  /** Required textbooks / materials (e.g. extracted from an uploaded screenshot). */
  textbookInfo?: string;
}

/** Render the instructor's course facts as a prompt block (empty when none given). */
function courseInfoBlock(info: SyllabusCourseInfo): string {
  const lines = [
    info.courseName ? `Course name/title: ${info.courseName}` : "",
    info.courseCode ? `Course code/number: ${info.courseCode}` : "",
    info.instructorName ? `Instructor name: ${info.instructorName}` : "",
    info.instructorEmail ? `Instructor email: ${info.instructorEmail}` : "",
    info.courseDescription ? `Official course description (use this VERBATIM for the course description section): ${info.courseDescription}` : "",
    info.startDate ? `Course start date (compute any week/date schedule from this; do not reuse dates from the old syllabus): ${info.startDate}` : "",
    info.meetingDays ? `Meeting days: ${info.meetingDays}` : "",
    info.meetingTimes ? `Meeting times: ${info.meetingTimes}` : "",
    info.location ? `Meeting location: ${info.location}` : "",
    info.textbookInfo ? `Required textbooks / materials (use this VERBATIM for the textbook/materials section): ${info.textbookInfo}` : "",
  ].filter(Boolean);
  return lines.length ? lines.join("\n") : "(none provided)";
}

// Shared guidance so the AI describes work generically and uses instructor facts.
const SYLLABUS_STYLE_RULES = `- When describing weekly tasks or content, use generic, domain-neutral language for the TYPE of work (e.g. "create tables", "write functions", "build an API endpoint") rather than the codebase's specific project nouns (e.g. do NOT write "create mission/moon tables" — write "create tables").
- Use the instructor-provided course facts above exactly where they apply (meeting info, and schedule dates derived from the start date).
- Do not invent specific facts (instructor name, room numbers, dates) that are neither provided above nor implied by the codebase; leave the original text for the instructor to fill in.`;

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Week k: Mon D - Mon D" lines computed exactly from a YYYY-MM-DD start date. */
function computeWeekDates(startDate: string | undefined, weeks: number): string {
  if (!startDate) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate.trim());
  if (!m) return "";
  const base = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const lines: string[] = [];
  for (let k = 0; k < weeks; k += 1) {
    const s = new Date(base + k * 7 * 86_400_000);
    const e = new Date(base + (k * 7 + 6) * 86_400_000);
    lines.push(`Week ${k + 1}: ${MONTH_ABBR[s.getUTCMonth()]} ${s.getUTCDate()} - ${MONTH_ABBR[e.getUTCMonth()]} ${e.getUTCDate()}`);
  }
  return lines.join("\n");
}

/** Summarize a codebase zip (file tree, per-week topics, key files, and any
 *  explicit schedule/outline the repo contains) as LLM context. */
async function summarizeCodebaseZip(zipBase64: string): Promise<string> {
  const JSZipMod = (await import("jszip")).default;
  const zip = await JSZipMod.loadAsync(Buffer.from(zipBase64, "base64"));
  const paths: string[] = [];
  zip.forEach((relativePath, entry) => {
    if (!entry.dir) paths.push(relativePath);
  });
  const tree = paths.slice(0, 250).join("\n");

  // Read a zip entry as bounded text, or "" if missing/unreadable.
  const readText = async (p: string, max: number): Promise<string> => {
    const entry = zip.file(p);
    if (!entry) return "";
    try {
      return (await entry.async("string")).slice(0, max);
    } catch {
      return "";
    }
  };

  // Top-level entries (folders/files at the repo root), in natural order — these
  // are typically the per-week assignments, so list them so the AI can map them.
  const topLevel = Array.from(new Set(paths.map((p) => p.split("/")[0]).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );

  // A one-line topic per top-level folder, from its README/intro heading — so the
  // per-week entries carry real topics (course repos are often one folder = one
  // week), not just folder names.
  const firstHeading = (text: string): string => {
    for (const line of text.split(/\r?\n/)) {
      const t = line.replace(/^#+\s*/, "").trim();
      if (t) return t.slice(0, 120);
    }
    return "";
  };
  const READMEISH = /^(readme|index|topic|overview)[^/]*\.(md|markdown|txt|rst)$/i;
  const topicLines: string[] = [];
  for (const dir of topLevel.slice(0, 20)) {
    const readmePath = paths.find((p) => {
      const parts = p.split("/");
      return parts.length === 2 && parts[0] === dir && READMEISH.test(parts[1]);
    });
    if (!readmePath) continue;
    const heading = firstHeading(await readText(readmePath, 800));
    if (heading) topicLines.push(`${dir}: ${heading}`);
  }

  // Explicit schedule / course-outline files anywhere in the repo (by name). When
  // present, these carry the real weekly + topic schedule for THIS offering, so
  // pull them in with a generous budget as the authoritative schedule source.
  const SCHEDULE_RE =
    /(^|\/)[^/]*(schedule|weekly|outline|topics?|calendar|curriculum|agenda|course[-_]?plan|lesson[-_]?plan|syllabus)[^/]*\.(md|markdown|txt|rst|adoc|org|csv)$/i;
  const schedulePaths = paths.filter((p) => SCHEDULE_RE.test(p)).slice(0, 6);
  let scheduleContents = "";
  let scheduleBudget = 16000;
  for (const p of schedulePaths) {
    if (scheduleBudget <= 0) break;
    const text = await readText(p, Math.min(scheduleBudget, 8000));
    if (text) {
      scheduleContents += `\n--- ${p} ---\n${text}\n`;
      scheduleBudget -= text.length;
    }
  }

  const KEY_RE =
    /(^|\/)(readme(\.[a-z]+)?|package\.json|pyproject\.toml|requirements\.txt|setup\.py|cargo\.toml|go\.mod|pom\.xml|composer\.json|gemfile|index\.(md|html|js|ts))$/i;
  const keyPaths = paths.filter((p) => KEY_RE.test(p)).slice(0, 8);
  let keyContents = "";
  let budget = 12000;
  for (const p of keyPaths) {
    if (budget <= 0) break;
    const text = await readText(p, Math.min(budget, 4000));
    if (text) {
      keyContents += `\n--- ${p} ---\n${text}\n`;
      budget -= text.length;
    }
  }

  const topicsBlock = topicLines.length
    ? `\n\nPER-WEEK TOPICS (from each top-level folder's intro/readme):\n${topicLines.join("\n")}`
    : "";
  const scheduleBlock = scheduleContents
    ? `\n\nCOURSE SCHEDULE / OUTLINE FILES FOUND IN THE REPO (verbatim — the real weekly + topic schedule for this offering):${scheduleContents}`
    : "";
  return `TOP-LEVEL ENTRIES (in order — each is typically one weekly assignment):\n${topLevel.join("\n")}${topicsBlock}\n\nFILE TREE (truncated):\n${tree}\n\nKEY FILES:${keyContents || "\n(none found)"}${scheduleBlock}`;
}

/**
 * Extract the first JSON object from a text string, handling optional ```json fence.
 * Returns the substring from the first '{' to the last '}', or null if not found.
 */
function jsonObjectSlice(text: string): string | null {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

/** Parse the first JSON object out of an LLM response (strips a ``` fence). */
function extractJsonObject(text: string): Record<string, unknown> | null {
  const jsonText = jsonObjectSlice(text);
  if (!jsonText) return null;
  try {
    return JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Pull textbook / course-materials details out of uploaded screenshots using the
 * vision model, as a plain-text block for the syllabus materials section. Returns
 * "" when there are no images, the model fails, or nothing was found.
 */
async function extractTextbookInfoFromImages(
  images: Array<{ base64: string; mimeType: string }>,
  provider: LlmProvider
): Promise<string> {
  if (images.length === 0) return "";
  const parts: LlmPart[] = [
    {
      text: `The image(s) are screenshots of textbook / course-materials information. Extract every relevant detail and return it as a concise plain-text block for a syllabus "Required textbooks and materials" section. Include, when present: title, author(s), edition, publisher, year, ISBN, format (print/ebook/online), and whether each item is required or optional. Omit any field that is absent. If there are several items, list each one. Return ONLY the extracted details as plain text with no preamble and no markdown headings. If the image contains no textbook or materials information, return exactly: NONE`,
    },
  ];
  for (const img of images) {
    if (img.base64 && img.mimeType) parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
  }
  const r = await callLlm(
    { contents: [{ role: "user", parts }], generationConfig: { temperature: 0.1, maxOutputTokens: 1024 } },
    provider
  );
  if (!r.ok) return "";
  const text = r.text.trim();
  return !text || /^none$/i.test(text) ? "" : text;
}

/**
 * Standalone: extract textbook / course-materials details from one or more
 * uploaded photos/screenshots, for use outside the syllabus flow (e.g. the
 * Courses hub). Returns the extracted plain-text block, or "" if nothing found.
 */
export async function extractTextbookInfoAction(
  images: Array<{ base64: string; mimeType: string }>,
  provider: LlmProvider = "gemini"
): Promise<{ text: string } | { error: string }> {
  try {
    await requireOwner();
    if (!images || images.length === 0) return { error: "Upload at least one image." };
    return { text: await extractTextbookInfoFromImages(images, provider) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read the textbook image." };
  }
}

/**
 * Write a spoken-word lecture script for recording (teleprompter-ready).
 * Targets roughly 140 words per minute of the requested duration.
 */
export async function generateLectureScriptAction(
  topic: string,
  objectives: string,
  targetMinutes: number,
  provider: LlmProvider = "gemini"
): Promise<{ script: string } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!topic.trim()) return { error: "Enter a lecture topic." };
    const minutes = Number.isFinite(targetMinutes) && targetMinutes >= 1 && targetMinutes <= 30 ? Math.round(targetMinutes) : 5;
    const words = minutes * 140;
    const styleBlock = await getWritingStyleBlock(user.id);
    const parts: LlmPart[] = [
      {
        text: [
          `Write a spoken-word lecture script for a college instructor to read aloud on camera about: ${topic.trim()}.`,
          objectives.trim() ? `Cover these objectives/notes:\n${objectives.trim()}` : "",
          `Target length: about ${words} words (${minutes} minutes at a natural speaking pace).`,
          "Rules: conversational but precise; short sentences; first person; open with a one-sentence hook and end with a brief recap plus what students should do next. Insert [PAUSE] on its own line between major sections. Return ONLY the script as plain text - no headings, no markdown, no stage directions other than [PAUSE]." + styleBlock,
        ].filter(Boolean).join("\n\n"),
      },
    ];
    const r = await callLlm(
      { contents: [{ role: "user", parts }], generationConfig: { temperature: 0.6, maxOutputTokens: 4096 } },
      provider
    );
    if (!r.ok || !r.text.trim()) return { error: "The model returned no script. Try again." };
    return { script: r.text.trim() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate the script." };
  }
}

/** One slide's extracted text plus its AI narration. */
export interface SlideNarration {
  slide: number;
  title: string;
  text: string;
  narration: string;
}

export async function extractPptxSlidesAction(
  base64: string
): Promise<{ slides: Array<{ slide: number; title: string; text: string }> } | { error: string }> {
  try {
    await requireOwner();
    if (!base64) return { error: "Upload a .pptx file." };
    const paragraphs = await parseOfficeParagraphs("pptx", Buffer.from(base64, "base64"));
    const bySlide = new Map<number, string[]>();
    for (const p of paragraphs) {
      if (typeof p.slide !== "number" || !p.text.trim()) continue;
      (bySlide.get(p.slide) ?? bySlide.set(p.slide, []).get(p.slide)!).push(p.text.trim());
    }
    const slides = [...bySlide.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([slide, texts]) => ({ slide, title: texts[0] ?? `Slide ${slide}`, text: texts.join("\n") }));
    if (!slides.length) return { error: "No slide text found in that file." };
    return { slides };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read the PowerPoint." };
  }
}

export async function generateSlideNarrationAction(
  slides: Array<{ slide: number; title: string; text: string }>,
  provider: LlmProvider = "gemini"
): Promise<{ narrations: SlideNarration[] } | { error: string }> {
  try {
    await requireOwner();
    if (!slides.length) return { error: "Extract slides first." };
    if (slides.length > 60) return { error: "That deck is too large (60 slide limit)." };
    const parts: LlmPart[] = [
      {
        text: [
          "Write a spoken narration script for a lecture over these presentation slides. For EACH slide write 2-5 conversational first-person sentences an instructor would say while that slide is shown - do not read bullets verbatim; explain them.",
          'Return ONLY a JSON array like [{"slide": 1, "narration": "..."}] covering every slide number given, in order. No markdown.',
          "Slides:",
          slides.map((s) => `Slide ${s.slide}: ${s.text}`).join("\n\n"),
        ].join("\n\n"),
      },
    ];
    const r = await callLlm(
      { contents: [{ role: "user", parts }], generationConfig: { temperature: 0.5, maxOutputTokens: 8192 } },
      provider
    );
    if (!r.ok) return { error: "The model returned no narration." };
    const raw = parseLenientJsonArray(r.text) as Array<{ slide?: number; narration?: string }> | null;
    if (!raw) return { error: "Could not parse the narration output." };
    const byNum = new Map(raw.filter((x) => typeof x.slide === "number" && typeof x.narration === "string").map((x) => [x.slide as number, (x.narration as string).trim()]));
    const narrations = slides.map((s) => ({ ...s, narration: byNum.get(s.slide) ?? "" }));
    if (narrations.every((n) => !n.narration)) return { error: "The model produced no usable narration." };
    return { narrations };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not write the narration." };
  }
}

/** Whether the ElevenLabs voice API is configured (for the UI to gate buttons). */
export async function voiceConfiguredAction(): Promise<{ configured: boolean }> {
  try {
    await requireOwner();
    return { configured: !!process.env.ELEVENLABS_API_KEY?.trim() };
  } catch {
    return { configured: false };
  }
}

/** List available ElevenLabs stock voices. */
export async function listElevenVoicesAction(): Promise<
  { voices: Array<{ voiceId: string; name: string; category: string }> } | { error: string }
> {
  try {
    await requireOwner();
    const key = process.env.ELEVENLABS_API_KEY?.trim();
    if (!key) return { error: "Voice generation is not configured. Set ELEVENLABS_API_KEY." };
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": key },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { error: `Voice service error (HTTP ${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}` };
    }
    const data = (await res.json().catch(() => null)) as { voices?: Array<{ voice_id?: string; name?: string; category?: string }> } | null;
    if (!data?.voices) return { error: "Could not fetch voice list." };
    const voices = data.voices
      .filter((v) => v.voice_id && v.name)
      .map((v) => ({
        voiceId: v.voice_id!,
        name: v.name!,
        category: v.category ?? "",
      }));
    return { voices };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list voices." };
  }
}

/** Get the user's voice and writing style settings. */
export async function getUserStyleAction(): Promise<
  { style: { voiceId: string | null; voiceSampleName: string | null; hasVoiceSample: boolean; writingSample: string | null } } | { error: string }
> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const style = await getUserStyle(supabase, user.id);
    return {
      style: {
        voiceId: style?.voiceId ?? null,
        voiceSampleName: style?.voiceSampleName ?? null,
        hasVoiceSample: !!style?.voiceSamplePath,
        writingSample: style?.writingSample ?? null,
      },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load your voice and writing settings." };
  }
}

/** Save or update the writing sample (capped at 20k chars; empty clears it). */
export async function saveWritingSampleAction(text: string): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const trimmed = text.trim();
    if (trimmed.length > 20_000) {
      return { error: "Keep the writing sample under 20,000 characters." };
    }
    await saveUserStyle(supabase, user.id, {
      writingSample: trimmed || null,
    });
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save your writing sample." };
  }
}

/**
 * Create or replace the user's cloned voice from audio samples.
 * Uploads the first sample file and stores voice_id and sample metadata.
 * Best-effort deletes the old ElevenLabs voice if a different one exists.
 */
export async function setVoiceCloneAction(
  name: string,
  files: Array<{ base64: string; mimeType: string; fileName: string }>
): Promise<{ voiceId: string } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();

    // Use the existing createVoiceCloneAction flow
    const cloneResult = await createVoiceCloneAction(name, files);
    if ("error" in cloneResult) {
      return cloneResult;
    }

    const newVoiceId = cloneResult.voiceId;

    // Upload the first sample file
    if (!files.length) {
      return { error: "No audio samples provided." };
    }

    const firstFile = files[0];
    const bytes = Buffer.from(firstFile.base64, "base64");
    const blob = new Blob([new Uint8Array(bytes)], { type: firstFile.mimeType || "audio/mpeg" });

    const recordingFile = await saveRecordingFile(supabase, user.id, blob, {
      name: `Voice sample - ${name}`,
      kind: "file",
      mimeType: firstFile.mimeType || "audio/mpeg",
      durationSec: null,
      source: "voice-sample",
    });

    // Get the old voice ID to delete later
    const oldStyle = await getUserStyle(supabase, user.id);
    const oldVoiceId = oldStyle?.voiceId;

    // Save the new voice settings
    await saveUserStyle(supabase, user.id, {
      voiceId: newVoiceId,
      voiceSamplePath: recordingFile.storagePath,
      voiceSampleName: recordingFile.name,
    });

    // Best-effort delete old ElevenLabs voice
    if (oldVoiceId && oldVoiceId !== newVoiceId) {
      const key = process.env.ELEVENLABS_API_KEY?.trim();
      if (key) {
        try {
          await fetch(`https://api.elevenlabs.io/v1/voices/${oldVoiceId}`, {
            method: "DELETE",
            headers: { "xi-api-key": key },
          });
        } catch {
          // Ignore deletion failures
        }
      }
    }

    return { voiceId: newVoiceId };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not set up your cloned voice." };
  }
}

/** Remove the cloned voice and clear the sample. */
export async function removeVoiceCloneAction(): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();

    const style = await getUserStyle(supabase, user.id);
    if (!style) {
      return { ok: true };
    }

    const voiceId = style.voiceId;

    // Best-effort delete ElevenLabs voice
    if (voiceId) {
      const key = process.env.ELEVENLABS_API_KEY?.trim();
      if (key) {
        try {
          await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
            method: "DELETE",
            headers: { "xi-api-key": key },
          });
        } catch {
          // Ignore deletion failures
        }
      }
    }

    // Remove sample file best-effort
    if (style.voiceSamplePath) {
      try {
        await supabase.storage.from("recordings").remove([style.voiceSamplePath]);
      } catch {
        // Ignore deletion failures
      }
    }

    // Clear all voice settings
    await clearVoiceClone(supabase, user.id);

    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not remove your cloned voice." };
  }
}

/** Get a signed URL for the stored voice sample (3600s expiration). */
export async function getVoiceSampleUrlAction(): Promise<{ url: string } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();

    const style = await getUserStyle(supabase, user.id);
    if (!style?.voiceSamplePath) {
      return { error: "No voice sample stored." };
    }

    const url = await getRecordingFileUrl(
      supabase,
      {
        id: "",
        name: "",
        kind: "file",
        mimeType: "",
        sizeBytes: 0,
        durationSec: null,
        storagePath: style.voiceSamplePath,
        source: null,
        origin: null,
        workflowName: null,
        workflowId: null,
        workflowRunId: null,
        createdAt: "",
      },
      3600
    );
    return { url };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not get the voice sample URL." };
  }
}

/**
 * Resolve the narration voice ID for the given user.
 * Resolution order: voiceIdOverride -> user_style.voice_id -> env ELEVENLABS_VOICE_ID -> stock.
 */
async function resolveNarrationVoiceId(userId: string, voiceIdOverride?: string): Promise<string> {
  if (voiceIdOverride?.trim()) {
    return voiceIdOverride.trim();
  }

  const supabase = createServiceClient();
  const style = await getUserStyle(supabase, userId);
  if (style?.voiceId) {
    return style.voiceId;
  }

  return process.env.ELEVENLABS_VOICE_ID?.trim() || "21m00Tcm4TlvDq8ikWAM";
}

/**
 * Get the writing style block to inject into LLM prompts.
 * Returns "" if no sample, else a block with truncated sample.
 */
async function getWritingStyleBlock(userId: string): Promise<string> {
  try {
    const supabase = createServiceClient();
    const style = await getUserStyle(supabase, userId);
    if (!style?.writingSample) {
      return "";
    }

    let sample = style.writingSample;

    // Strip the prompt scaffolding: PROMPT lines are dropped entirely and
    // the RESPONSE label is removed from response lines, so only the
    // instructor's own prose feeds the style sample.
    const lines = sample.split("\n");
    const filtered = lines
      .filter((line) => !line.startsWith(PROMPT_PREFIX))
      .map((line) => (line.startsWith(RESPONSE_PREFIX) ? line.slice(RESPONSE_PREFIX.length).trimStart() : line));
    sample = filtered.join("\n").trim();

    if (!sample) {
      return "";
    }

    // Truncate to 1500 chars
    if (sample.length > 1500) {
      sample = sample.slice(0, 1500) + "...";
    }

    return `\n\nMATCH THE INSTRUCTOR'S PERSONAL WRITING STYLE (tone, rhythm, vocabulary) shown in this sample:\n${sample}`;
  } catch {
    return "";
  }
}

/**
 * Internal helper: make one ElevenLabs text-to-speech call and return the audio buffer.
 * Throws on !res.ok with the formatted error text.
 */
async function synthesizeSegment(
  key: string,
  voiceId: string,
  text: string
): Promise<Buffer> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Voice service error (HTTP ${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Synthesize one narration segment with ElevenLabs and return it as base64
 * MP3. Called per slide so responses stay small. Uses ELEVENLABS_API_KEY and
 * optional ELEVENLABS_VOICE_ID (defaults to the standard "Rachel" voice until
 * the user's cloned voice id is configured).
 */
export async function synthesizeNarrationAction(
  text: string,
  voiceIdOverride?: string
): Promise<{ base64: string; mimeType: string } | { error: string }> {
  try {
    const user = await requireOwner();
    const key = process.env.ELEVENLABS_API_KEY?.trim();
    if (!key) return { error: "Voice generation is not configured. Set ELEVENLABS_API_KEY (and ELEVENLABS_VOICE_ID for your cloned voice)." };
    const t = text.trim();
    if (!t) return { error: "Nothing to synthesize." };
    if (t.length > 4000) return { error: "That segment is too long for one synthesis call." };
    const voiceId = await resolveNarrationVoiceId(user.id, voiceIdOverride);
    const buf = await synthesizeSegment(key, voiceId, t);
    return { base64: buf.toString("base64"), mimeType: "audio/mpeg" };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not synthesize audio." };
  }
}

/**
 * Synthesize a long narration script by automatically chunking it into segments
 * (sentence-safe splits, max 3800 chars each) and concatenating the audio.
 * Handles scripts up to ~38k chars (about 10 segments, 25 minutes of speech).
 * Returns concatenated MPEG audio frames (standard players read as one stream).
 */
export async function synthesizeLongNarrationAction(
  text: string,
  voiceIdOverride?: string
): Promise<{ base64: string; mimeType: string; segments: number } | { error: string }> {
  try {
    const user = await requireOwner();
    const key = process.env.ELEVENLABS_API_KEY?.trim();
    if (!key) return { error: "Voice generation is not configured. Set ELEVENLABS_API_KEY (and ELEVENLABS_VOICE_ID for your cloned voice)." };
    const t = text.trim();
    if (!t) return { error: "Nothing to synthesize." };
    // 10-chunk ceiling keeps the call inside the platform's 60s function cap.
    if (t.length > 38_000) return { error: "The script is too long to narrate (about 25 minutes of speech). Reduce the script minutes." };
    const voiceId = await resolveNarrationVoiceId(user.id, voiceIdOverride);
    const chunks = splitNarrationText(t);
    if (chunks.length > 10) return { error: "The script is too long to narrate (about 25 minutes of speech). Reduce the script minutes." };
    const buffers: Buffer[] = [];
    for (let i = 0; i < chunks.length; i++) {
      try {
        const buf = await synthesizeSegment(key, voiceId, chunks[i]);
        buffers.push(buf);
      } catch (err) {
        return { error: `Segment ${i + 1} of ${chunks.length}: ${err instanceof Error ? err.message : "Could not synthesize audio."}` };
      }
    }
    // ElevenLabs returns raw MPEG audio frames; byte concatenation of consecutive
    // segments plays as one continuous stream in standard players.
    const payload = Buffer.concat(buffers);
    return { base64: payload.toString("base64"), mimeType: "audio/mpeg", segments: chunks.length };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not synthesize audio." };
  }
}

/**
 * Create an ElevenLabs instant voice clone from uploaded audio samples and
 * return its voice id. Samples must total under ~7 MB (server action body cap).
 */
export async function createVoiceCloneAction(
  name: string,
  files: Array<{ base64: string; mimeType: string; fileName: string }>
): Promise<{ voiceId: string } | { error: string }> {
  try {
    await requireOwner();
    const key = process.env.ELEVENLABS_API_KEY?.trim();
    if (!key) return { error: "Set ELEVENLABS_API_KEY to create a voice clone." };
    if (!name.trim()) return { error: "Name the voice (e.g. your own name)." };
    if (!files.length) return { error: "Upload at least one audio sample." };
    const totalBytes = files.reduce((s, f) => s + Math.ceil(f.base64.length * 0.75), 0);
    if (totalBytes > 7 * 1024 * 1024) return { error: "Samples are too large (7 MB total limit here). One to three minutes of clean audio is enough." };
    const form = new FormData();
    form.append("name", name.trim());
    for (const f of files) {
      const bytes = Buffer.from(f.base64, "base64");
      form.append("files", new Blob([new Uint8Array(bytes)], { type: f.mimeType || "audio/mpeg" }), f.fileName || "sample.mp3");
    }
    const res = await fetch("https://api.elevenlabs.io/v1/voices/add", {
      method: "POST",
      headers: { "xi-api-key": key },
      body: form,
    });
    const data = (await res.json().catch(() => null)) as { voice_id?: string; detail?: { message?: string } | string } | null;
    if (!res.ok || !data?.voice_id) {
      const msg = typeof data?.detail === "string" ? data.detail : data?.detail?.message;
      if (msg && msg.toLowerCase().includes("does not include instant voice cloning")) {
        return { error: "Your ElevenLabs plan does not include instant voice cloning (it needs Starter or higher). Pick a ready-made voice below instead - all narration features work with it." };
      }
      return { error: `Voice clone failed (HTTP ${res.status})${msg ? `: ${msg.slice(0, 200)}` : ""}` };
    }
    return { voiceId: data.voice_id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the voice clone." };
  }
}

/** Whether the HeyGen avatar API is configured (for the UI to gate buttons). */
export async function avatarConfiguredAction(): Promise<{ configured: boolean }> {
  try {
    await requireOwner();
    return { configured: !!process.env.HEYGEN_API_KEY?.trim() && !!process.env.HEYGEN_AVATAR_ID?.trim() };
  } catch {
    return { configured: false };
  }
}

/**
 * Start a HeyGen avatar video render of a narration script. Returns the job's
 * video id; poll getAvatarVideoStatusAction until it completes. Env:
 * HEYGEN_API_KEY, HEYGEN_AVATAR_ID, optional HEYGEN_VOICE_ID.
 */
export async function generateAvatarVideoAction(
  script: string
): Promise<{ videoId: string } | { error: string }> {
  try {
    await requireOwner();
    const key = process.env.HEYGEN_API_KEY?.trim();
    const avatarId = process.env.HEYGEN_AVATAR_ID?.trim();
    if (!key || !avatarId) return { error: "Avatar generation is not configured. Set HEYGEN_API_KEY and HEYGEN_AVATAR_ID (your avatar's id)." };
    const t = script.trim();
    if (!t) return { error: "Nothing to render." };
    if (t.length > 9000) return { error: "That script is too long for one avatar video (about 9,000 characters max). Trim the narration or split the deck." };
    const voiceId = process.env.HEYGEN_VOICE_ID?.trim();
    const res = await fetch("https://api.heygen.com/v2/video/generate", {
      method: "POST",
      headers: { "X-Api-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        video_inputs: [
          {
            character: { type: "avatar", avatar_id: avatarId, avatar_style: "normal" },
            voice: voiceId ? { type: "text", input_text: t, voice_id: voiceId } : { type: "text", input_text: t },
          },
        ],
        dimension: { width: 1280, height: 720 },
      }),
    });
    const data = (await res.json().catch(() => null)) as { data?: { video_id?: string }; error?: { message?: string } } | null;
    if (!res.ok || !data?.data?.video_id) {
      return { error: `Avatar service error (HTTP ${res.status})${data?.error?.message ? `: ${data.error.message}` : ""}` };
    }
    return { videoId: data.data.video_id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start the avatar video." };
  }
}

/** Poll a HeyGen render job. status: processing | completed | failed. */
export async function getAvatarVideoStatusAction(
  videoId: string
): Promise<{ status: string; videoUrl: string | null } | { error: string }> {
  try {
    await requireOwner();
    const key = process.env.HEYGEN_API_KEY?.trim();
    if (!key) return { error: "Avatar generation is not configured." };
    if (!videoId.trim()) return { error: "Missing video id." };
    const res = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`, {
      headers: { "X-Api-Key": key },
    });
    const data = (await res.json().catch(() => null)) as { data?: { status?: string; video_url?: string | null; error?: { message?: string } | null } } | null;
    if (!res.ok || !data?.data?.status) return { error: `Avatar status error (HTTP ${res.status}).` };
    if (data.data.status === "failed") return { error: `Avatar render failed${data.data.error?.message ? `: ${data.data.error.message}` : ""}.` };
    return { status: data.data.status, videoUrl: data.data.video_url ?? null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not check the avatar video." };
  }
}

/** A timed caption for an uploaded screen recording. */
export interface ScreenCaption {
  start: number;
  end: number;
  text: string;
}

/**
 * Describe an uploaded screen recording from sampled keyframes: returns timed
 * captions narrating what is happening on screen.
 */
export async function describeScreenRecordingAction(
  frames: Array<{ timeSec: number; base64: string }>,
  durationSec: number,
  context: string,
  provider: LlmProvider = "gemini"
): Promise<{ captions: ScreenCaption[] } | { error: string }> {
  try {
    await requireOwner();
    if (!frames.length) return { error: "No frames were extracted from the video." };
    if (frames.length > 30) return { error: "Too many frames; sample the video more sparsely." };
    const parts: LlmPart[] = [
      {
        text: [
          "The images are keyframes sampled from a screen recording (software/computer usage), in order, with their timestamps in seconds:",
          frames.map((f, i) => `Frame ${i + 1}: t=${Math.round(f.timeSec)}s`).join("\n"),
          context.trim() ? `Context from the author: ${context.trim()}` : "",
          `The full video is ${Math.round(durationSec)} seconds long.`,
          'Write viewer captions that narrate what is happening on screen. Return ONLY a JSON array like [{"start": 0, "end": 6, "text": "..."}] - seconds as numbers, segments in order, covering 0 to the full duration with no gaps or overlaps, one segment per meaningful action (merge frames showing the same action), each text a single concise present-tense sentence under 14 words. No markdown, no code fences.',
        ].filter(Boolean).join("\n\n"),
      },
      ...frames.map((f) => ({ inlineData: { mimeType: "image/jpeg", data: f.base64 } })),
    ];
    const r = await callLlm(
      { contents: [{ role: "user", parts }], generationConfig: { temperature: 0.2, maxOutputTokens: 4096 } },
      provider
    );
    if (!r.ok) return { error: "The model returned no captions. Try again." };
    const raw = parseLenientJsonArray(r.text) as Array<{ start?: number; end?: number; text?: string }> | null;
    if (!raw) return { error: "Could not parse captions from the model output. Try generating again." };
    const captions = raw
      .filter((c) => typeof c.start === "number" && typeof c.end === "number" && typeof c.text === "string" && c.text.trim())
      .map((c) => ({ start: Math.max(0, c.start as number), end: Math.min(durationSec, c.end as number), text: (c.text as string).trim() }))
      .filter((c) => c.end > c.start);
    if (!captions.length) return { error: "The model produced no usable captions." };
    return { captions };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not describe the recording." };
  }
}

/**
 * Generate timed narration segments for a video: returns a script that an
 * instructor would speak over each part, synchronized to the video timeline.
 */
export async function generateVideoNarrationAction(
  frames: Array<{ timeSec: number; base64: string }>,
  durationSec: number,
  context: string,
  provider: LlmProvider = "gemini"
): Promise<{ segments: Array<{ start: number; end: number; text: string }> } | { error: string }> {
  try {
    await requireOwner();
    if (!frames.length) return { error: "No frames were extracted from the video." };
    if (frames.length > 30) return { error: "Too many frames; sample the video more sparsely." };
    const parts: LlmPart[] = [
      {
        text: [
          "The images are keyframes sampled from a video (classroom recording, screen capture, or lecture footage), in order, with their timestamps in seconds:",
          frames.map((f, i) => `Frame ${i + 1}: t=${Math.round(f.timeSec)}s`).join("\n"),
          context.trim() ? `Context from the author: ${context.trim()}` : "",
          `The full video is ${Math.round(durationSec)} seconds long.`,
          'Write a spoken narration script for a voice-over of this video. Return ONLY a JSON array like [{"start": 0, "end": 12, "text": "..."}] - seconds as numbers, segments in order covering 0 to the full duration with no overlaps, each segment 5-25 seconds, each text 1-3 conversational first-person-plural sentences an instructor would SAY over that part of the video (not captions - flowing spoken narration that explains what is happening and why). No markdown, no code fences.',
        ].filter(Boolean).join("\n\n"),
      },
      ...frames.map((f) => ({ inlineData: { mimeType: "image/jpeg", data: f.base64 } })),
    ];
    const r = await callLlm(
      { contents: [{ role: "user", parts }], generationConfig: { temperature: 0.2, maxOutputTokens: 4096 } },
      provider
    );
    if (!r.ok) return { error: "The model returned no narration. Try again." };
    const raw = parseLenientJsonArray(r.text) as Array<{ start?: number; end?: number; text?: string }> | null;
    if (!raw) return { error: "Could not parse narration from the model output. Try generating again." };
    const segments = raw
      .filter((s) => typeof s.start === "number" && typeof s.end === "number" && typeof s.text === "string" && s.text.trim())
      .map((s) => ({ start: Math.max(0, s.start as number), end: Math.min(durationSec, s.end as number), text: (s.text as string).trim() }))
      .filter((s) => s.end > s.start);
    if (!segments.length) return { error: "The model produced no usable narration segments." };
    return { segments };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate video narration." };
  }
}

/**
 * Extract an ordered list of course topics from a repository's file tree, README,
 * and package.json. Used to prefill the Topics field for review and editing.
 */
export async function extractTopicsFromRepoAction(
  repoRef: string,
  provider: LlmProvider = "gemini"
): Promise<{ topics: string[] } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };

    // Gather repo context: tree, README, and package.json (each with graceful fallback).
    let tree = "";
    try {
      const treeData = await getRepoTree(parsed.owner, parsed.repo);
      const blobs = treeData.filter((e) => e.type === "blob").map((e) => e.path);
      tree = blobs.slice(0, 400).join("\n");
    } catch {
      // If tree fetch fails, that's okay; we'll try other sources.
    }

    let readmeContent = "";
    try {
      readmeContent = await getFileText(parsed.owner, parsed.repo, "README.md");
    } catch {
      // Try lowercase fallback.
      try {
        readmeContent = await getFileText(parsed.owner, parsed.repo, "readme.md");
      } catch {
        // No README found; continue without it.
      }
    }
    if (readmeContent.length > 6000) readmeContent = readmeContent.slice(0, 6000);

    let packageJsonContent = "";
    try {
      packageJsonContent = await getFileText(parsed.owner, parsed.repo, "package.json");
    } catch {
      // package.json not present or not readable; continue without it.
    }
    if (packageJsonContent.length > 2000) packageJsonContent = packageJsonContent.slice(0, 2000);

    // Guard: insufficient content.
    const blobCount = tree.split("\n").filter(Boolean).length;
    if (!readmeContent && blobCount < 3) {
      return { error: "The repo has too little content to extract topics from." };
    }

    // Build prompt for LLM.
    const sections: string[] = [];
    if (tree) sections.push(`FILE TREE:\n${tree}`);
    if (readmeContent) sections.push(`README:\n${readmeContent}`);
    if (packageJsonContent) sections.push(`PACKAGE.JSON:\n${packageJsonContent}`);

    const prompt = [
      "You are an expert curriculum designer. Below are the file tree and README of a course-related code repository. Derive the ordered list of TOPICS a course built on this repository covers. Return ONLY a JSON array of strings, one concise topic per entry (8-30 topics), ordered from foundational to advanced. No numbering inside the strings, no markdown.",
      "",
      sections.join("\n\n"),
    ].join("\n\n");

    const r = await callLlm(
      { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 2048 } },
      provider
    );
    if (!r.ok) return { error: "The model returned no topics. Try again." };
    const raw = parseLenientJsonArray(r.text) as string[] | null;
    if (!raw) return { error: "Could not parse topics from the model output. Try extracting again." };
    const topics = raw.filter((t) => typeof t === "string" && t.trim()).map((t) => (t as string).trim());
    if (!topics.length) return { error: "The model produced no usable topics." };
    return { topics };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not extract topics from the repository." };
  }
}

/**
 * Set the topics (labels) on a repository to organize it by section or cohort.
 */
export async function setRepoTopicsAction(repoRef: string, topics: string[]): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await setRepoTopics(parsed.owner, parsed.repo, topics);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not set repo topics." };
  }
}

/**
 * Read a former syllabus (.docx) and a codebase zip. Pass 1 identifies the
 * class-specific NON-schedule fields and the weekly-schedule block's bounds; pass
 * 2 produces a complete replacement for EVERY paragraph in that block, so the old
 * schedule is fully cleared and replaced. Returns the editable fields, the
 * schedule replacements, all paragraphs, and the codebase summary.
 */
export async function analyzeSyllabusInputsAction(
  syllabus: { name: string; base64: string },
  zipBase64: string | null,
  courseInfo: SyllabusCourseInfo = {},
  provider: LlmProvider = "gemini",
  textbookImages: Array<{ base64: string; mimeType: string }> | null = null
): Promise<
  | {
      fields: SyllabusInputField[];
      scheduleReplacements: Record<string, string>;
      paragraphs: Array<{ id: string; text: string; runs: RunSpan[] }>;
      codebaseSummary: string;
      textbookInfo: string;
    }
  | { error: string }
> {
  try {
    await requireOwner();
    const buffer = Buffer.from(syllabus.base64, "base64");
    const paragraphs = await parseOfficeParagraphs("docx", buffer);
    if (paragraphs.length === 0) {
      return { error: "Could not read any text from that file. Upload the former syllabus as a Word .docx." };
    }
    const codebaseSummary = zipBase64 ? await summarizeCodebaseZip(zipBase64) : "(no codebase provided)";

    // Embedded Deterministic Engine: detect fields by matching "Label: value"
    // lines, pre-filling from the provided course facts. No model call, and no
    // weekly-schedule rewrite (out of reach for rule-based templating).
    if (provider === "embedded") {
      return {
        fields: scaffoldSyllabusFields(paragraphs, courseInfo),
        scheduleReplacements: {},
        paragraphs,
        codebaseSummary,
        textbookInfo: "",
      };
    }

    // Pull textbook details out of any uploaded screenshots, and fold them into
    // the course facts so the textbook/materials field is filled from them.
    const textbookInfo =
      textbookImages && textbookImages.length > 0
        ? await extractTextbookInfoFromImages(textbookImages, provider)
        : "";
    const combinedTextbook = [courseInfo.textbookInfo?.trim(), textbookInfo.trim()].filter(Boolean).join("\n\n");
    const info: SyllabusCourseInfo = combinedTextbook ? { ...courseInfo, textbookInfo: combinedTextbook } : courseInfo;

    const paraList = paragraphs.map((p) => `[${p.id}] ${p.text}`).join("\n");
    const byId = new Map(paragraphs.map((p) => [p.id, p.text]));

    // ── Pass 1: non-schedule class-specific fields + schedule block bounds. ──
    const prompt1 = `You are adapting an existing course syllabus for a new offering. The codebase is summarized so you know what the course is about.

CODEBASE SUMMARY:
${codebaseSummary}

INSTRUCTOR-PROVIDED COURSE FACTS:
${courseInfoBlock(info)}

The syllabus is a list of numbered paragraphs (id in brackets):
${paraList}

1) Identify the CLASS-SPECIFIC, NON-SCHEDULE paragraphs that need the instructor to provide or confirm a value — course title/number, instructor name, term/semester, meeting times and location, office hours, course description, learning objectives, textbooks/tools, grading breakdown, and similar. Leave generic boilerplate OUT (university policies, academic-integrity, accessibility/Title IX, etc.). Do NOT include weekly-schedule paragraphs here.

2) Locate the WEEKLY SCHEDULE / course outline block — the consecutive run of paragraphs that list the weeks, dates, topics, and weekly descriptions (often a table). INCLUDE every week in the block, including rows for exams, tests, quizzes, reviews, breaks, holidays, and finals — the block's LAST paragraph is the last such weekly row (for example a final-exam or review week), NOT the last row that happens to be labeled "Week N". Return the id of its FIRST and LAST paragraph. If there is no weekly schedule, use null for both.

Return ONLY valid JSON:
{
  "fields": [ { "paragraphId": "p12", "label": "Course title", "suggestedText": "..." } ],
  "scheduleStartId": "p81",
  "scheduleEndId": "p131"
}

Requirements:
- Use exact paragraphId values; suggestedText is the COMPLETE replacement for that paragraph.
${SYLLABUS_STYLE_RULES}
- Do not include any text outside the JSON object.`;

    const r1 = await callLlm(
      { contents: [{ role: "user", parts: [{ text: prompt1 }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 8192 } },
      provider
    );
    if (!r1.ok) {
      return { error: `Analysis failed: HTTP ${r1.status} — ${r1.body.slice(0, 200)}` };
    }
    const parsed1 = extractJsonObject(r1.text);
    if (!parsed1) {
      return { error: "Could not parse the analysis result." };
    }

    const startId = typeof parsed1.scheduleStartId === "string" ? parsed1.scheduleStartId : "";
    const endId = typeof parsed1.scheduleEndId === "string" ? parsed1.scheduleEndId : "";
    const startIdx = paragraphs.findIndex((p) => p.id === startId);
    const endIdx = paragraphs.findIndex((p) => p.id === endId);
    const schedulePairs =
      startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx ? paragraphs.slice(startIdx, endIdx + 1) : [];
    const scheduleIds = new Set(schedulePairs.map((p) => p.id));

    const fields: SyllabusInputField[] = (Array.isArray(parsed1.fields) ? parsed1.fields : [])
      .map((f) => {
        const o = (f ?? {}) as { paragraphId?: unknown; label?: unknown; suggestedText?: unknown };
        const paragraphId = typeof o.paragraphId === "string" ? o.paragraphId : "";
        const currentText = byId.get(paragraphId) ?? "";
        const suggestedText =
          typeof o.suggestedText === "string" && o.suggestedText.trim() ? o.suggestedText.trim() : currentText;
        return {
          paragraphId,
          label: typeof o.label === "string" && o.label.trim() ? o.label.trim() : "Field",
          currentText,
          suggestedText,
        };
      })
      .filter((f) => f.paragraphId && byId.has(f.paragraphId) && !scheduleIds.has(f.paragraphId));

    // ── Pass 2: a complete replacement for EVERY schedule paragraph. ──
    const scheduleReplacements: Record<string, string> = {};
    if (schedulePairs.length > 0) {
      const schedList = schedulePairs.map((p) => `[${p.id}] ${p.text}`).join("\n");
      // How many weeks to compute dates for. Besides explicit "Week N" numbers,
      // also count unnumbered term rows (exams, tests, quizzes, reviews, breaks,
      // finals) so a schedule whose last weeks are labeled "Final Exam" or "Review"
      // is not cut short. Overcounting is harmless (extra dates go unused);
      // undercounting drops the tail weeks.
      let maxWeek = 0;
      let specialWeeks = 0;
      for (const p of schedulePairs) {
        const wm = p.text.match(/week\s*(\d+)/i);
        if (wm) {
          maxWeek = Math.max(maxWeek, Number(wm[1]));
        } else if (/\b(midterm|finals?|exams?|quiz(?:zes)?|test|review|break|holiday|reading\s*day|no\s*class)\b/i.test(p.text)) {
          specialWeeks += 1;
        }
      }
      const weeks = Math.max(maxWeek + specialWeeks, Math.min(24, schedulePairs.length));
      const weekDates = computeWeekDates(courseInfo.startDate, weeks);
      const datesBlock = weekDates
        ? `EXACT WEEK DATES — use these verbatim and never any other date:\n${weekDates}\n\n`
        : "";

      const prompt2 = `You are completely rewriting the WEEKLY SCHEDULE of a course syllabus for a new offering. The previous offering's schedule must be entirely cleared and replaced.

CODEBASE SUMMARY:
${codebaseSummary}

INSTRUCTOR-PROVIDED COURSE FACTS:
${courseInfoBlock(info)}

${datesBlock}Here are the schedule paragraphs (id in brackets), in order:
${schedList}

Rewrite the schedule for THIS course. Return a NEW replacement for EVERY paragraph id above.

DATES — ${weekDates
        ? "Use ONLY the EXACT WEEK DATES listed above: a paragraph for week k uses week k's dates, in the SAME date style the paragraph already uses."
        : "Compute consecutive weekly dates from the course start date (week 1 begins on the start date), one week apart."} The previous offering's dates MUST NOT appear anywhere — every old date (for example any January/February/March/April dates that are not in the list above) must be replaced.

TOPICS — Use the codebase's real schedule for THIS offering, in this priority: (1) if a "COURSE SCHEDULE / OUTLINE FILES FOUND IN THE REPO" section is present, it is AUTHORITATIVE - take each week's topic, order, and description from it; (2) otherwise use the "PER-WEEK TOPICS" list (each top-level folder's topic), in order; (3) otherwise treat each TOP-LEVEL ENTRY as one week, in order. Week k's topic and description come from week k of that source. The previous offering's topics and descriptions MUST NOT appear anywhere - every old topic or description (anything not derived from THIS codebase) must be replaced.

ALL WEEKS — The schedule may run longer than the last numbered "Week N": treat EVERY weekly row as one consecutive week, in order, INCLUDING rows for exams, tests, quizzes, reviews, breaks, and finals. Rewrite and KEEP every one of them (update their dates from the list above); never stop early or drop the exam/review/final weeks. For an exam/test/quiz/review/break/final row, keep it as that kind of week (do not replace it with a codebase topic); map codebase topics only to the instructional weeks, in order.

FORMAT — Preserve each paragraph's role and layout (a "Week N (dates): topic" line stays that shape; a separate dates cell stays a dates cell; a topic/description cell stays a topic/description cell) — only the content changes.

Return ONLY valid JSON mapping each id to its new text:
{ "replacements": { "p81": "...", "p82": "..." } }

Requirements:
- Include a replacement for EVERY id listed above; do not omit a single one.
- Do not keep ANY date, topic, or description from the previous offering.
${SYLLABUS_STYLE_RULES}
- Do not include any text outside the JSON object.`;

      const r2 = await callLlm(
        { contents: [{ role: "user", parts: [{ text: prompt2 }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 16384 } },
        provider
      );
      if (r2.ok) {
        const parsed2 = extractJsonObject(r2.text);
        const reps =
          parsed2 && typeof parsed2.replacements === "object" && parsed2.replacements
            ? (parsed2.replacements as Record<string, unknown>)
            : {};
        const returnedAny = Object.keys(reps).length > 0;
        for (const p of schedulePairs) {
          const v = reps[p.id];
          if (typeof v === "string" && v.trim()) scheduleReplacements[p.id] = v.trim();
          // Clear any schedule paragraph the model skipped so no old date/topic survives
          // (only when it returned something — never blank the whole schedule on a failure).
          else if (returnedAny) scheduleReplacements[p.id] = "";
        }
      }
    }

    if (fields.length === 0 && Object.keys(scheduleReplacements).length === 0) {
      return { error: "No class-specific sections were identified in that syllabus." };
    }
    return {
      fields,
      scheduleReplacements,
      paragraphs: paragraphs.map((p) => ({ id: p.id, text: p.text, runs: p.runs })),
      codebaseSummary,
      textbookInfo,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/**
 * Regenerate the replacement text for a single syllabus field, using the codebase
 * summary and instructor facts. Returns just the new paragraph text.
 */
export async function regenerateSyllabusFieldAction(
  field: { label: string; currentText: string },
  codebaseSummary: string,
  courseInfo: SyllabusCourseInfo = {},
  provider: LlmProvider = "gemini"
): Promise<{ text: string } | { error: string }> {
  try {
    await requireOwner();
    // Embedded Deterministic Engine: no model to rewrite a field, so keep the
    // current text; the instructor edits it directly.
    if (provider === "embedded") {
      return { text: field.currentText };
    }

    const prompt = `You are writing the replacement text for ONE field of a course syllabus being adapted for a new offering.

CODEBASE SUMMARY:
${codebaseSummary}

INSTRUCTOR-PROVIDED COURSE FACTS:
${courseInfoBlock(courseInfo)}

FIELD: ${field.label}
CURRENT TEXT IN THE SYLLABUS:
${field.currentText}

Write a fresh, complete replacement for this one paragraph for the new offering. Keep the original's style, labels, and approximate length; only change the class-specific content.

${SYLLABUS_STYLE_RULES}

Return ONLY the replacement paragraph text — no JSON, no quotes, no commentary.`;

    const result = await callLlm(
      { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 1024 } },
      provider
    );
    if (!result.ok) {
      return { error: `Regeneration failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }
    let text = result.text.trim();
    const fenced = text.match(/```(?:\w+)?\s*([\s\S]*?)```/);
    if (fenced) text = fenced[1].trim();
    if (!text) {
      return { error: "The model returned empty text." };
    }
    return { text };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/**
 * Rewrite a single paragraph of an Office document with AI. The whole document's
 * text is given as context so the rewrite fits in; only the named paragraph is
 * rewritten and its plain text returned (no formatting).
 */
export async function rewriteOfficeParagraphAction(
  documentText: string,
  paragraphText: string,
  provider: LlmProvider = "gemini"
): Promise<{ text: string } | { error: string }> {
  try {
    await requireOwner();
    if (!paragraphText.trim()) return { error: "There is no text in this paragraph to rewrite." };

    // Embedded Deterministic Engine: copy-edit the paragraph by rule (cut wordy
    // phrases and filler, fix punctuation and casing) instead of a model rewrite.
    if (provider === "embedded") {
      return { text: copyedit(paragraphText) };
    }

    const prompt = `You are editing one paragraph of a document. Here is the full document for context:

---
${documentText.slice(0, 12000)}
---

Rewrite ONLY this paragraph so it is clearer and well written, keeping its meaning, role, and approximate length, and matching the document's tone:

"""
${paragraphText}
"""

Return ONLY the rewritten paragraph text — no JSON, no quotes, no commentary.`;

    const result = await callLlm(
      { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 1024 } },
      provider
    );
    if (!result.ok) {
      return { error: `Rewrite failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }
    let text = result.text.trim();
    const fenced = text.match(/```(?:\w+)?\s*([\s\S]*?)```/);
    if (fenced) text = fenced[1].trim();
    text = text.replace(/^"|"$/g, "").trim();
    if (!text) return { error: "The model returned empty text." };
    return { text };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/**
 * Rebuild the syllabus .docx from the instructor's ordered sections — supporting
 * edited, deleted, and added paragraphs while preserving the original formatting —
 * and return the new file as base64. Each section names the source paragraph id
 * whose style it borrows; a known paragraph absent from the list is removed.
 */
export async function buildAdaptedSyllabusAction(
  syllabusBase64: string,
  sections: Array<{ sourceId: string; spans: RunSpan[] }>
): Promise<{ base64: string } | { error: string }> {
  try {
    await requireOwner();
    const buffer = Buffer.from(syllabusBase64, "base64");
    const out = await applyOfficeSections("docx", buffer, sections);
    return { base64: out.toString("base64") };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not build the syllabus." };
  }
}

// ── Google Calendar scheduling ──────────────────────────────────────────────

/** Whether the owner has connected Google Calendar (and can read free/busy). */
export async function getGoogleCalendarStatusAction(): Promise<
  { connected: boolean } | { error: string }
> {
  try {
    const user = await requireOwner();
    const creds = await getCredentials(user.id);
    return { connected: !!creds && !!creds.refreshToken };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not check the connection." };
  }
}

/** Forget the owner's Google connection. */
export async function disconnectGoogleCalendarAction(): Promise<
  { ok: true } | { error: string }
> {
  try {
    const user = await requireOwner();
    await deleteCredentials(user.id);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not disconnect Google Calendar." };
  }
}

// ── Closed-LMS integration suite (CHUNK E) ──────────────────────────────────

/** E1: Fetch an ICS feed from a URL (calendar export). */
export async function fetchIcsFeedAction(url: string): Promise<{ ics: string } | { error: string }> {
  try {
    await requireOwner();

    const parsedUrl = new URL(url);
    if (!parsedUrl.protocol.match(/^https?:$/)) {
      return { error: "Calendar feed URL must be http or https." };
    }

    const response = await fetch(url, {
      headers: { "User-Agent": "teaching-assistant/1.0" },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return { error: `Failed to fetch calendar feed: HTTP ${response.status}` };
    }

    const text = await response.text();

    if (text.length > 2_000_000) {
      return { error: "The feed is too large." };
    }

    return { ics: text };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not fetch the calendar feed.",
    };
  }
}

/** E2: Save institution field definitions (e.g. calendar feed URLs). */
export async function saveInstitutionFieldsAction(
  acronym: string,
  fields: InstitutionField[]
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    await saveInstitutionFields(supabase, user.id, acronym, fields);
    return { ok: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not save institution fields.",
    };
  }
}

/** E3: List institutions that have calendar feeds configured. */
export async function listInstitutionsWithFeedsAction(): Promise<
  { institutions: Array<{ acronym: string; feedUrls: string[] }> } | { error: string }
> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const allInstitutions = await listAllInstitutionFields(supabase, user.id);

    const institutions = allInstitutions
      .map(({ acronym, fields }) => {
        const feedUrls = fields
          .filter((f) => f.id.startsWith("calendarFeedUrl") && f.value.trim())
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((f) => f.value.trim());

        return { acronym, feedUrls };
      })
      .filter((i) => i.feedUrls.length > 0);

    return { institutions };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not list institutions with feeds.",
    };
  }
}

/** E4: Get calendar feed URLs for one institution. */
export async function listInstitutionFeedUrlsAction(acronym: string): Promise<
  { feedUrls: string[] } | { error: string }
> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const fields = await loadInstitutionFields(supabase, user.id, acronym);

    const feedUrls = fields
      .filter((f) => f.id.startsWith("calendarFeedUrl") && f.value.trim())
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((f) => f.value.trim());

    return { feedUrls };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not list institution feed URLs.",
    };
  }
}

/** E5: Fetch recent messages from Outlook inbox. */
export async function listOutlookMessagesAction(
  institution: string,
  sinceIso?: string
): Promise<
  { messages: Array<{ id: string; subject: string; fromAddress: string; fromName: string; receivedDateTime: string; isRead: boolean; webLink: string; bodyPreview: string }> } | { error: string }
> {
  try {
    const user = await requireOwner();
    const token = await getMicrosoftAccessToken(user.id, institution);

    if (!token) {
      return {
        error: `Connect Outlook for ${institution} under Account > Integrations first.`,
      };
    }

    const messages = await listRecentMessages(token, { top: 50, sinceIso });
    return { messages };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not list Outlook messages.",
    };
  }
}

/** List all Outlook messages from every connected account. Per-account failures are captured without aborting other accounts. */
export async function listAllOutlookMessagesAction(
  sinceIso?: string
): Promise<
  { accounts: Array<{ institution: string; messages: Message[]; error?: string }> } | { error: string }
> {
  try {
    const user = await requireOwner();
    const withScope = await listConnectedInstitutionsWithScope(user.id);

    if (withScope.length === 0) {
      return {
        error: "Connect Outlook under Account > Integrations first.",
      };
    }

    const accounts: Array<{ institution: string; messages: Message[]; error?: string }> = [];

    for (const { institution } of withScope) {
      try {
        const token = await getMicrosoftAccessToken(user.id, institution);

        if (!token) {
          accounts.push({
            institution,
            messages: [],
            error: `Connect Outlook for ${institution} under Account > Integrations first.`,
          });
          continue;
        }

        const messages = await listRecentMessages(token, { top: 50, sinceIso });
        accounts.push({ institution, messages });
      } catch (err) {
        accounts.push({
          institution,
          messages: [],
          error: err instanceof Error ? err.message : "Could not list messages.",
        });
      }
    }

    return { accounts };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not check Outlook connections.",
    };
  }
}

/** E6: Send an email via Outlook. */
export async function sendOutlookMailAction(
  institution: string,
  to: string[],
  subject: string,
  body: string,
  bcc?: string[]
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const token = await getMicrosoftAccessToken(user.id, institution);

    if (!token) {
      return {
        error: `Connect Outlook for ${institution} under Account > Integrations first.`,
      };
    }

    await sendMail(token, { to, bcc, subject, body });
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && err.message === "MAIL_SEND_NOT_GRANTED") {
      return {
        error: `Outlook is connected but sending is not granted - reconnect Outlook for ${institution} to grant Mail.Send.`,
      };
    }
    return {
      error: err instanceof Error ? err.message : "Could not send the email.",
    };
  }
}

/**
 * E7: Send a message draft by email via Outlook.
 * Only accessible from the Drafts UI, never from workflow steps.
 * Requires institution and appropriate recipient/course info in the draft payload.
 */
export async function sendMessageDraftByEmailAction(id: string): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const draft = await getMessageDraft(supabase, user.id, id);

    if (!draft) {
      return { error: "That message draft was not found." };
    }

    const { payload } = draft;

    if (!payload.institution) {
      return { error: "The draft has no institution to send from." };
    }

    const institution = payload.institution;
    let to: string[] = [];
    let bcc: string[] = [];
    let subject: string;

    if (payload.kind === "message" || payload.kind === "reply") {
      if (!payload.recipientEmail) {
        return { error: "The draft has no recipient email." };
      }
      to = [payload.recipientEmail];
      subject = payload.title || draft.summary;
    } else if (payload.kind === "announcement") {
      if (!payload.hubCourseId) {
        return { error: "The draft has no course to announce to." };
      }

      const courses = await listCourseHubRows(user.id);
      const course = courses.find((c) => c.id === payload.hubCourseId);

      if (!course) {
        return { error: "The course tile was not found." };
      }

      const emails = course.studentRepos
        .map((s) => s.email)
        .filter((e): e is string => typeof e === "string" && e.trim().length > 0)
        .map((e) => e.trim());

      if (emails.length === 0) {
        return {
          error: "No student emails on the course tile roster - run Import roster from CSV first.",
        };
      }

      bcc = emails;
      to = [];
      subject = payload.title || "Announcement";
    } else {
      return { error: "Unknown message draft kind." };
    }

    const res = await sendOutlookMailAction(institution, to, subject, payload.body, bcc.length > 0 ? bcc : undefined);
    if ("error" in res) {
      throw new Error(res.error);
    }

    await markMessageDraftReviewed(supabase, user.id, id);
    return { ok: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not send the message by email.",
    };
  }
}

/** Mark an Outlook message as read or unread. */
export async function markOutlookMessageReadAction(
  institution: string,
  messageId: string,
  isRead: boolean
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const token = await getMicrosoftAccessToken(user.id, institution);

    if (!token) {
      return {
        error: `Connect Outlook for ${institution} under Account > Integrations first.`,
      };
    }

    await markMessageRead(token, messageId, isRead);
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && err.message === "MAIL_READWRITE_NOT_GRANTED") {
      return {
        error: `Outlook is connected but mailbox updates are not granted - reconnect Outlook for ${institution} to grant Mail.ReadWrite.`,
      };
    }
    return {
      error: err instanceof Error ? err.message : "Could not mark message read.",
    };
  }
}

/** E8: Extended Outlook status with scope information (whether Mail.Send and Mail.ReadWrite are granted). */
export async function getOutlookStatusAction(): Promise<
  { connected: string[]; canSend: string[]; canMarkRead: string[] } | { error: string }
> {
  try {
    const user = await requireOwner();
    const withScope = await listConnectedInstitutionsWithScope(user.id);

    const connected = withScope.map((s) => s.institution);
    const canSend = withScope
      .filter((s) => s.scope && s.scope.includes("Mail.Send"))
      .map((s) => s.institution);
    const canMarkRead = withScope
      .filter((s) => s.scope && s.scope.includes("Mail.ReadWrite"))
      .map((s) => s.institution);

    return { connected, canSend, canMarkRead };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not check Outlook connections." };
  }
}

// ── Syllabus template library ───────────────────────────────────────────────

const MAX_TEMPLATE_BASE64 = 8 * 1024 * 1024; // ~6 MB .docx

/** List the owner's saved syllabus templates (metadata only). */
export async function listSyllabusTemplatesAction(): Promise<
  { templates: SyllabusTemplateMeta[] } | { error: string }
> {
  try {
    const user = await requireOwner();
    return { templates: await listTemplates(user.id) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list syllabus templates." };
  }
}

/** Fetch one syllabus template including its base64 .docx content. */
export async function getSyllabusTemplateAction(
  id: string
): Promise<{ template: SyllabusTemplate } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!id.trim()) return { error: "Choose a template." };
    const template = await getTemplate(user.id, id);
    if (!template) return { error: "That template no longer exists." };
    return { template };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not open the template." };
  }
}

/** Save a new syllabus template from an uploaded .docx (base64). */
export async function createSyllabusTemplateAction(
  name: string,
  fileName: string,
  base64: string
): Promise<{ template: SyllabusTemplateMeta } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!name.trim()) return { error: "Enter a template name." };
    if (!/\.docx$/i.test(fileName.trim())) return { error: "The template must be a Word .docx file." };
    if (!base64) return { error: "Upload a .docx file." };
    if (base64.length > MAX_TEMPLATE_BASE64) return { error: "That file is too large (limit ~6 MB)." };
    return { template: await createTemplate(user.id, name.trim(), fileName.trim(), base64) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the template." };
  }
}

/** Rename a syllabus template and/or replace its .docx file. */
export async function updateSyllabusTemplateAction(
  id: string,
  fields: { name?: string; fileName?: string; base64?: string }
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!id.trim()) return { error: "Choose a template." };
    const update: { name?: string; fileName?: string; content?: string } = {};
    if (fields.name !== undefined) {
      if (!fields.name.trim()) return { error: "Enter a template name." };
      update.name = fields.name.trim();
    }
    if (fields.base64 !== undefined) {
      if (!fields.fileName || !/\.docx$/i.test(fields.fileName.trim())) {
        return { error: "The template must be a Word .docx file." };
      }
      if (fields.base64.length > MAX_TEMPLATE_BASE64) return { error: "That file is too large (limit ~6 MB)." };
      update.fileName = fields.fileName.trim();
      update.content = fields.base64;
    }
    if (Object.keys(update).length === 0) return { error: "Nothing to update." };
    await updateTemplate(user.id, id, update);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the template." };
  }
}

/** Delete a syllabus template. */
export async function deleteSyllabusTemplateAction(
  id: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!id.trim()) return { error: "Choose a template." };
    await deleteTemplate(user.id, id);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the template." };
  }
}

/**
 * Generate a complete filled syllabus .docx from a saved template and a block
 * of course facts, in one shot. The model sees the template's paragraph list
 * and returns per-paragraph replacements; policy boilerplate stays untouched,
 * and the docx is rebuilt through the same helper the adapt flow uses.
 */
export async function generateCourseSyllabusAction(
  templateId: string,
  facts: {
    courseName: string;
    courseCode: string;
    term: string;
    description: string;
    dayTime: string;
    startDate: string;
    weeks: string;
    tests: string;
    textbook: string;
    email: string;
    lmsUrl: string;
    institution: string;
  },
  provider: LlmProvider = "gemini"
): Promise<{ base64: string; name: string } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!templateId.trim()) return { error: "Choose a syllabus template." };
    const template = await getTemplate(user.id, templateId);
    if (!template) return { error: "Choose a syllabus template." };

    const buffer = Buffer.from(template.content, "base64");
    const paragraphs = await parseOfficeParagraphs("docx", buffer);
    if (paragraphs.length === 0) {
      return { error: "Could not read any text from that template. Save the template as a Word .docx." };
    }

    // Paragraph list for the model (id + text), capped at ~16000 chars overall
    // so a long template cannot blow out the prompt.
    const paraLines: string[] = [];
    let paraChars = 0;
    for (const p of paragraphs) {
      const line = `[${p.id}] ${p.text}`;
      if (paraChars + line.length + 1 > 16000) break;
      paraLines.push(line);
      paraChars += line.length + 1;
    }
    const paraList = paraLines.join("\n");

    const factEntries: Array<[string, string]> = [
      ["Course name", facts.courseName],
      ["Course code", facts.courseCode],
      ["Term/semester", facts.term],
      ["Course description", facts.description],
      ["Meeting days/times", facts.dayTime],
      ["Start date", facts.startDate],
      ["Number of weeks", facts.weeks],
      ["Tests/exams", facts.tests],
      ["Textbook/materials", facts.textbook],
      ["Instructor email", facts.email],
      ["LMS URL", facts.lmsUrl],
      ["Institution", facts.institution],
    ];
    const factsBlock = factEntries
      .map(([label, value]) => `${label}: ${value.trim() || "(not provided)"}`)
      .join("\n");

    const prompt = `You are filling in a course syllabus template for a new course offering.

COURSE FACTS:
${factsBlock}

The syllabus template is a list of numbered paragraphs (id in brackets):
${paraList}

Identify every paragraph whose text should change to reflect the course facts above — course title/number, term, instructor contact info, meeting days and times, start and end dates, course description, weekly schedule rows, tests/exams, textbook and materials, LMS links, institution name, and similar class-specific content. Leave generic policy boilerplate untouched (university policies, academic integrity, accessibility/Title IX, grading-scale rules, and the like).

Return ONLY a valid JSON array, where each element is:
{ "id": "<paragraphId>", "text": "<the COMPLETE replacement text for that paragraph>" }

Requirements:
- Use exact paragraph id values from the list; "text" fully replaces that paragraph's text.
- Keep each replacement in the same style and length register as the original paragraph (a short label line stays a short label line; a prose paragraph stays prose).
- Never invent facts that were not provided. Where a needed fact is "(not provided)", leave that paragraph unchanged by omitting it from the array.
- Only include paragraphs that actually change.
- Do not include any text outside the JSON array.`;

    // Guarded parse with one retry (same idiom as generateSlidesForAssignment):
    // a raw JSON.parse error must never surface, and a malformed first response
    // gets one fresh model call before giving up.
    let replacements: Array<{ id: string; text: string }> | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const result = await callLlm(
        {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
        },
        provider
      );
      if (!result.ok) {
        return { error: `Syllabus generation failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
      }

      const parsed = parseLenientJsonArray(result.text);
      if (!parsed) {
        if (attempt === 1) {
          console.error(`Syllabus JSON parse failed for template "${template.name}" (attempt 1): no JSON array in the response`);
          continue;
        }
        return { error: "Could not parse the syllabus from the model output. Try again." };
      }

      replacements = parsed
        .map((r) => {
          const o = (r ?? {}) as { id?: unknown; text?: unknown };
          return {
            id: typeof o.id === "string" ? o.id : "",
            text: typeof o.text === "string" ? o.text : "",
          };
        })
        .filter((r) => r.id && r.text.trim());
      break;
    }
    if (!replacements) {
      return { error: "Could not parse the syllabus from the model output. Try again." };
    }

    const byId = new Map(paragraphs.map((p) => [p.id, p]));
    const replacementById = new Map<string, string>();
    for (const r of replacements) {
      if (byId.has(r.id)) replacementById.set(r.id, r.text.trim());
    }

    // Rebuild through the same helper the adapt flow uses. Every paragraph gets
    // a section (applyOfficeSections deletes known paragraphs with no section);
    // unchanged paragraphs pass their original runs so they stay byte-for-byte.
    // Replaced paragraphs keep a leading bold label bold when the replacement
    // still starts with it (the boldLabelSpans pattern from the adapt editor).
    const sections = paragraphs.map((p) => {
      const replacement = replacementById.get(p.id);
      if (replacement === undefined || replacement === p.text) {
        return { sourceId: p.id, spans: p.runs.length > 0 ? p.runs : [{ text: p.text }] };
      }
      let boldPrefix = "";
      for (const run of p.runs) {
        if (!run.bold) break;
        boldPrefix += run.text;
      }
      const spans: RunSpan[] =
        boldPrefix && replacement.startsWith(boldPrefix) && replacement.length > boldPrefix.length
          ? [{ text: boldPrefix, bold: true }, { text: replacement.slice(boldPrefix.length) }]
          : [{ text: replacement }];
      return { sourceId: p.id, spans };
    });

    const out = await applyOfficeSections("docx", buffer, sections);
    return { base64: out.toString("base64"), name: `${facts.courseName.trim() || "Course"} Syllabus` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate the syllabus." };
  }
}

// ── Finalized syllabi library (the completed .docx outputs) ──────────────

/** List the owner's saved finalized syllabi (metadata only). */
export async function listFinalizedSyllabiAction(): Promise<
  { syllabi: FinalizedSyllabusMeta[] } | { error: string }
> {
  try {
    const user = await requireOwner();
    return { syllabi: await listSyllabi(user.id) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list your saved syllabi." };
  }
}

/** Fetch one finalized syllabus including its base64 .docx content. */
export async function getFinalizedSyllabusAction(
  id: string
): Promise<{ syllabus: FinalizedSyllabus } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!id.trim()) return { error: "Choose a syllabus." };
    const syllabus = await getSyllabus(user.id, id);
    if (!syllabus) return { error: "That syllabus no longer exists." };
    return { syllabus };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not open the syllabus." };
  }
}

/** A finalized syllabus parsed into formatted paragraphs for a read-only preview. */
export async function previewFinalizedSyllabusAction(
  id: string
): Promise<
  | { name: string; paragraphs: Array<{ id: string; text: string; runs: RunSpan[]; style: string }> }
  | { error: string }
> {
  try {
    const user = await requireOwner();
    if (!id.trim()) return { error: "Choose a syllabus." };
    const syllabus = await getSyllabus(user.id, id);
    if (!syllabus) return { error: "That syllabus no longer exists." };
    const buffer = Buffer.from(syllabus.content, "base64");
    const paragraphs = await parseOfficeParagraphs("docx", buffer);
    return {
      name: syllabus.name,
      paragraphs: paragraphs.map((p) => ({ id: p.id, text: p.text, runs: p.runs, style: p.style })),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not open the syllabus for preview." };
  }
}

/** Save a finalized syllabus (.docx base64) to the owner's library. */
export async function createFinalizedSyllabusAction(
  name: string,
  fileName: string,
  base64: string,
  courseCode?: string
): Promise<{ syllabus: FinalizedSyllabusMeta } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!name.trim()) return { error: "Enter a name for the syllabus." };
    if (!/\.docx$/i.test(fileName.trim())) return { error: "The syllabus must be a Word .docx file." };
    if (!base64) return { error: "Build the syllabus first." };
    if (base64.length > MAX_TEMPLATE_BASE64) return { error: "That file is too large (limit ~6 MB)." };
    return { syllabus: await createSyllabus(user.id, name.trim(), fileName.trim(), base64, courseCode?.trim() || undefined) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the syllabus." };
  }
}

/** Rename a finalized syllabus. */
export async function renameFinalizedSyllabusAction(
  id: string,
  name: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!id.trim()) return { error: "Choose a syllabus." };
    if (!name.trim()) return { error: "Enter a name for the syllabus." };
    await renameSyllabus(user.id, id, name.trim());
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not rename the syllabus." };
  }
}

/** Delete a finalized syllabus. */
export async function deleteFinalizedSyllabusAction(
  id: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!id.trim()) return { error: "Choose a syllabus." };
    await deleteSyllabus(user.id, id);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the syllabus." };
  }
}

// ── Course hub (bundle a course's resources: codebase, syllabus, textbook, Canvas) ──
// Named "CourseHub" to avoid collision with the Canvas listCoursesAction above.

/** List the owner's saved courses. */
export async function listCourseHubAction(): Promise<{ courses: CourseHub[] } | { error: string }> {
  try {
    const user = await requireOwner();
    return { courses: await listCourseHubRows(user.id) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list your courses." };
  }
}

/** Create a course. */
export async function createCourseHubAction(input: CourseHubInput): Promise<{ course: CourseHub } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!input.name?.trim()) return { error: "Enter a course name." };
    return { course: await createCourseRow(user.id, input) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the course." };
  }
}

/** Update a course. */
export async function updateCourseHubAction(
  id: string,
  input: CourseHubInput
): Promise<{ course: CourseHub } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!id.trim()) return { error: "Choose a course." };
    if (!input.name?.trim()) return { error: "Enter a course name." };
    return { course: await updateCourseRow(user.id, id, input) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the course." };
  }
}

/** Delete a course. */
export async function deleteCourseHubAction(id: string): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!id.trim()) return { error: "Choose a course." };
    await deleteCourseRow(user.id, id);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the course." };
  }
}

/** Update a course's materials zip metadata. */
export async function setCourseMaterialsAction(
  courseId: string,
  fields: {
    materialsZipName: string | null;
    materialsZipPath: string | null;
    materialsZipSize: number | null;
  }
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!courseId.trim()) return { error: "Choose a course." };
    await updateCourseMaterials(user.id, courseId, fields);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the course materials." };
  }
}

/** Update a course's CSV metadata. */
export async function setCourseCsvAction(
  courseId: string,
  csvName: string | null,
  csvData: string | null
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!courseId.trim()) return { error: "Choose a course." };
    await updateCourseCsv(user.id, courseId, { csvName, csvData });
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the course schedule CSV." };
  }
}

/** Update a course's rubric metadata. */
export async function setCourseRubricAction(
  courseId: string,
  rubricName: string | null,
  rubricData: string | null
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!courseId.trim()) return { error: "Choose a course." };
    await updateCourseRubric(user.id, courseId, { rubricName, rubricData });
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the course rubric." };
  }
}

/** Append a material file to a course's materials list. Returns the storage path of any replaced entry. */
export async function appendCourseMaterialFileAction(
  courseId: string,
  file: { name: string; path: string; size: number }
): Promise<{ replacedPath: string | null } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!courseId.trim()) return { error: "Choose a course." };
    const replacedPath = await appendCourseMaterialFile(user.id, courseId, {
      ...file,
      addedAt: new Date().toISOString(),
    });
    return { replacedPath };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the file to the course materials." };
  }
}

/** Remove a material file from a course's materials list. */
export async function removeCourseMaterialFileAction(
  courseId: string,
  path: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!courseId.trim()) return { error: "Choose a course." };
    await removeCourseMaterialFile(user.id, courseId, path);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not remove the file from the course materials." };
  }
}

/** Append an export file to a course's exports list. Returns the storage object paths of any replaced entry. */
export async function appendCourseExportFileAction(
  courseId: string,
  file: { name: string; path: string; size: number; parts?: string[] }
): Promise<{ replacedPaths: string[] } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!courseId.trim()) return { error: "Choose a course." };
    const replacedPaths = await appendCourseExportFile(user.id, courseId, {
      ...file,
      addedAt: new Date().toISOString(),
    });
    return { replacedPaths };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the file to the course exports." };
  }
}

/** Remove an export file from a course's exports list. */
export async function removeCourseExportFileAction(
  courseId: string,
  path: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!courseId.trim()) return { error: "Choose a course." };
    await removeCourseExportFile(user.id, courseId, path);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not remove the file from the course exports." };
  }
}

/** Per-course LMS notification counts (needs-grading + unread inbox) for its tile. */
export async function getCourseNotificationsAction(
  canvasUrl: string,
  institution?: string
): Promise<{ needsGrading: number; unread: number } | { error: string }> {
  try {
    await requireOwner();
    const match = canvasUrl.match(/\/courses\/(\d+)/);
    if (!match) return { error: "Course URL must look like .../courses/123." };
    const code = institution?.trim();
    if (!code) return { error: "Set this course's institution to load notifications." };
    return await getCourseNotifications(code, match[1]);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load notifications." };
  }
}

/** Fetch course metadata from the LMS: name, start date, and syllabus HTML. */
export async function getCourseInfoAction(
  courseUrl: string,
  acronym?: string
): Promise<{ name: string; startAt: string | null; syllabusBody: string } | { error: string }> {
  try {
    await requireOwner();
    return await getCourseInfo(courseUrl, acronym?.trim());
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load course information." };
  }
}

/** Export a course as an IMS Common Cartridge from the LMS. */
export async function exportCourseCartridgeAction(
  courseUrl: string,
  acronym?: string
): Promise<{ fileName: string; base64: string } | { error: string }> {
  try {
    await requireOwner();
    return await exportCourseCartridge(courseUrl, acronym?.trim());
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not export the course from the LMS." };
  }
}

/**
 * Fetch the LMS course's syllabus, convert it to a Word document,
 * save it to the finalized library, and return the saved syllabus metadata.
 */
export async function importLmsSyllabusAction(
  courseUrl: string,
  acronym: string | undefined,
  courseName: string
): Promise<{ syllabusId: string; name: string } | { error: string }> {
  try {
    await requireOwner();
    const info = await getCourseInfo(courseUrl, acronym?.trim());
    return await saveSyllabusHtmlAsFinalized(courseName, info.syllabusBody);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not import the syllabus from the LMS." };
  }
}

/**
 * Convert syllabus HTML pulled from an uploaded LMS export package into a Word
 * document in the finalized library. The client parses the cartridge (the
 * archive can exceed server action payload limits); only the small HTML body
 * crosses the wire.
 */
export async function importSyllabusHtmlAction(
  courseName: string,
  syllabusHtml: string
): Promise<{ syllabusId: string; name: string } | { error: string }> {
  try {
    await requireOwner();
    return await saveSyllabusHtmlAsFinalized(courseName, syllabusHtml);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not import the syllabus from the export." };
  }
}

/** Shared tail of the LMS/export syllabus imports: HTML to .docx to library. */
async function saveSyllabusHtmlAsFinalized(
  courseName: string,
  syllabusHtml: string
): Promise<{ syllabusId: string; name: string } | { error: string }> {
  if (!syllabusHtml.trim()) {
    return { error: "The LMS course has no syllabus content." };
  }

  const text = syllabusHtml
    .replace(/<\/p>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    // Collapse runs of spaces/tabs but keep the paragraph breaks added above.
    .replace(/[^\S\n]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");

  const docxBuffer = await buildDocxFromPlainText(text, [], undefined);
  const base64 = Buffer.from(docxBuffer).toString("base64");
  const syllabusName = `${courseName} syllabus (LMS import)`;
  const result = await createFinalizedSyllabusAction(syllabusName, "lms-syllabus.docx", base64);
  if ("error" in result) {
    return result;
  }
  return { syllabusId: result.syllabus.id, name: result.syllabus.name };
}

/** Forget the owner's Outlook connection for one school. */
export async function disconnectOutlookAction(
  institution: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!institution.trim()) return { error: "Choose a school." };
    await deleteMicrosoftCredentials(user.id, institution);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not disconnect Outlook." };
  }
}

/**
 * Find open meeting slots from the owner's Google Calendar free/busy within the
 * configured working hours, plus the real events (with titles) in that window and
 * the grid config, so the inbox can render a week-view picker that shades busy
 * time and highlights the open slots.
 */
export async function getAvailableSlotsAction(
  // Optional IANA time zone to reckon and display slots in. Omit to use the
  // account's configured zone (the default — no per-request override).
  timeZoneOverride?: string
): Promise<
  | {
      slots: string[];
      slotLabels: string[];
      events: CalendarEventBlock[];
      timeZone: string;
      workStartHour: number;
      workEndHour: number;
      slotMinutes: number;
    }
  | { error: string }
> {
  try {
    const user = await requireOwner();
    const token = await getValidAccessToken(user.id);
    if (!token) {
      return { error: "Google Calendar isn't connected. Connect it under Account > Integrations." };
    }
    const baseConfig = getSchedulingConfig();
    const timeZone = timeZoneOverride?.trim() || baseConfig.timeZone;
    const config = { ...baseConfig, timeZone };
    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + (config.lookaheadDays + 1) * 86_400_000).toISOString();
    // Free/busy drives the open-slot math; the events list (best-effort) only
    // supplies titles for the busy blocks, so a failure there still lets you pick.
    const [busy, events] = await Promise.all([
      queryFreeBusy(token, timeMin, timeMax, config.timeZone),
      listCalendarEvents(token, timeMin, timeMax, config.timeZone).catch(() => [] as CalendarEventBlock[]),
    ]);
    const slots = computeFreeSlots(busy, config, now);
    return {
      slots,
      slotLabels: formatSlotsForReply(slots, config.timeZone, config.slotMinutes),
      events,
      timeZone: config.timeZone,
      workStartHour: config.workStartHour,
      workEndHour: config.workEndHour,
      slotMinutes: config.slotMinutes,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load your availability." };
  }
}


/**
 * Draft a warm inbox reply that offers the given open times. Falls back to a
 * plain template if the model call fails, so the feature still works offline.
 */
export async function draftMeetingReplyAction(
  threadText: string,
  slotsISO: string[],
  provider: LlmProvider = "gemini",
  // Optional IANA zone to label the offered times in; defaults to the configured zone.
  timeZoneOverride?: string
): Promise<{ body: string } | { error: string }> {
  try {
    await requireOwner();
    if (slotsISO.length === 0) {
      return { error: "No open times to offer." };
    }
    const config = getSchedulingConfig();
    const timeZone = timeZoneOverride?.trim() || config.timeZone;
    const labels = formatSlotsForReply(slotsISO, timeZone, config.slotMinutes);
    const bulletedTimes = labels.map((l) => `- ${l}`).join("\n");

    const fallback = `Thanks for reaching out! I'd be glad to meet over a video call. Here are a few times that work on my end:\n\n${bulletedTimes}\n\nLet me know which one suits you and I'll send a Google Meet link.`;

    // Embedded Deterministic Engine: the plain template already offers the exact
    // open times; return it directly with no model call.
    if (provider === "embedded") {
      return { body: stripLongDashes(fallback) };
    }

    const prompt = `You are an instructor replying to a student who asked to meet over a video call.

CONVERSATION SO FAR (oldest message first):
${threadText.trim()}

AVAILABLE TIMES (offer these exact options, do not invent others):
${bulletedTimes}

Write the instructor's reply: warm and brief, confirm you're happy to meet over a video call, and list the available times as a short bulleted list exactly as given. Tell them to pick one and you'll send a Google Meet link. Output ONLY the reply text (plain text, no subject line, no salutation placeholder, no markdown headers). Never use em dashes or en dashes (the long dashes); use commas or hyphens instead.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
      },
      provider
    );
    if (!result.ok || !result.text.trim()) {
      return { body: stripLongDashes(fallback) };
    }
    return { body: stripLongDashes(result.text.trim()) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not draft the reply." };
  }
}

/**
 * Book a 30-minute (config-length) Google Meet on the owner's primary calendar
 * at the chosen slot, returning the Meet link to paste into the reply. The
 * student is invited by email only when one is supplied (Canvas exposes names,
 * not addresses).
 */
export async function createMeetingAction(
  startISO: string,
  studentName?: string,
  studentEmail?: string,
  // Optional IANA zone for the event; defaults to the configured zone.
  timeZoneOverride?: string
): Promise<{ meetLink: string | null; htmlLink: string | null; startISO: string } | { error: string }> {
  try {
    const user = await requireOwner();
    const token = await getValidAccessToken(user.id);
    if (!token) {
      return { error: "Google Calendar isn't connected. Connect it under Account > Integrations." };
    }
    const config = getSchedulingConfig();
    const timeZone = timeZoneOverride?.trim() || config.timeZone;
    const start = new Date(startISO);
    if (Number.isNaN(start.getTime())) {
      return { error: "That meeting time is invalid." };
    }
    const end = new Date(start.getTime() + config.slotMinutes * 60_000);
    const who = studentName?.trim() ? studentName.trim() : "student";
    const event = await createCalendarEvent(token, {
      summary: `Video call with ${who}`,
      description: "Scheduled from the Teaching Assistant inbox.",
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      timeZone,
      attendeeEmails: studentEmail?.trim() ? [studentEmail.trim()] : [],
    });
    return { meetLink: event.meetLink, htmlLink: event.htmlLink, startISO: start.toISOString() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the meeting." };
  }
}

/**
 * Classify whether the latest message in a thread is asking to schedule a live
 * meeting / video call, so the inbox can proactively surface the scheduler.
 * Fails closed (not a request) so a model hiccup never blocks the UI.
 */
export async function detectMeetingRequestAction(
  threadText: string,
  provider: LlmProvider = "gemini"
): Promise<{ isMeetingRequest: boolean; confidence: number }> {
  try {
    await requireOwner();
    if (!threadText.trim()) return { isMeetingRequest: false, confidence: 0 };

    // Embedded Deterministic Engine: classify by rule-based meeting-intent
    // signals in the latest message, no model call.
    if (provider === "embedded") {
      return detectMeetingRequestEmbedded(threadText);
    }

    const prompt = `Decide whether the MOST RECENT message in this conversation is asking the instructor to meet live (a video call, phone call, Zoom/Meet, office hours, or "can we talk"). A general question that does not ask to meet is not a meeting request.

CONVERSATION (oldest first):
${threadText.trim()}

Respond with ONLY a JSON object: {"isMeetingRequest": boolean, "confidence": number between 0 and 1}.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 80, responseMimeType: "application/json" },
      },
      provider
    );
    if (!result.ok) return { isMeetingRequest: false, confidence: 0 };

    const match = result.text.match(/\{[\s\S]*\}/);
    if (!match) return { isMeetingRequest: false, confidence: 0 };
    const parsed = JSON.parse(match[0]) as { isMeetingRequest?: unknown; confidence?: unknown };
    return {
      isMeetingRequest: parsed.isMeetingRequest === true,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    };
  } catch {
    return { isMeetingRequest: false, confidence: 0 };
  }
}

/**
 * Draft an announcement (title + body) from a short instruction. The author
 * reviews and edits before anything is posted.
 */
export async function draftAnnouncementAction(
  instruction: string,
  provider: LlmProvider = "gemini"
): Promise<{ title: string; message: string } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!instruction.trim()) {
      return { error: "Describe what the announcement should say first." };
    }

    // Embedded Deterministic Engine: template the announcement from the
    // instruction with no model call.
    if (provider === "embedded") {
      return scaffoldAnnouncement(instruction);
    }

    const styleBlock = await getWritingStyleBlock(user.id);

    const prompt = `You are an instructor writing a course announcement for students.

WHAT TO ANNOUNCE:
${instruction.trim()}${styleBlock}

Write a clear, warm, professional announcement. Return ONLY valid JSON:
{
  "title": "...",
  "message": "..."
}

Requirements:
- "title": a short, specific subject line (no more than ~10 words).
- "message": the announcement body, addressed directly to students. Use plain text with blank lines between paragraphs; do not use markdown, headings, or bullet symbols.
- Keep it concise and actionable. Do not invent dates, links, or details that were not provided.
- Do not include any text outside the JSON object.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 1024 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Draft failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const jsonText = jsonObjectSlice(result.text);
    if (!jsonText) {
      return { error: "Could not parse the draft from the model response." };
    }

    const parsed = JSON.parse(jsonText) as {
      title?: string;
      message?: string;
    };

    return { title: (parsed.title ?? "").trim(), message: (parsed.message ?? "").trim() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/**
 * Draft a reply to a Canvas message, given the existing thread (oldest first)
 * and an optional steer. Returns plain text the author can edit before sending.
 */
export async function draftMessageReplyAction(
  threadText: string,
  instructions: string,
  provider: LlmProvider = "gemini"
): Promise<{ body: string } | { error: string }> {
  try {
    const user = await requireOwner();
    if (!threadText.trim()) {
      return { error: "Open a conversation before drafting a reply." };
    }

    // Embedded Deterministic Engine: return a courteous, editable reply template
    // with no model call.
    if (provider === "embedded") {
      return scaffoldMessageReply(threadText, instructions);
    }

    const styleBlock = await getWritingStyleBlock(user.id);

    const steer = instructions.trim()
      ? `\n\nHOW TO REPLY:\n${instructions.trim()}`
      : "";

    const prompt = `You are an instructor replying to a student's message in the Canvas inbox.

CONVERSATION SO FAR (oldest message first):
${threadText.trim()}${steer}${styleBlock}

Write the instructor's reply. Respond directly to the most recent message, in a warm, helpful, professional tone. Output ONLY the reply text itself: plain text, no subject line, no salutation placeholder like "[Name]", no markdown. Do not invent facts, dates, grades, or links that are not present in the thread. Never use em dashes or en dashes (the long dashes); use commas or hyphens instead.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 1024 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Draft failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const body = stripLongDashes(result.text.trim());
    if (!body) {
      return { error: "The model returned an empty reply." };
    }
    return { body };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

// ── Live Feed (Grading) ─────────────────────────────────────────────────────

/**
 * Report, per institution acronym, whether its Canvas and grading-service env
 * vars are configured — so the Live Feed table can flag missing setup without
 * exposing any secret values.
 */
export async function checkInstitutionsAction(
  acronyms: string[]
): Promise<
  | { statuses: Array<{ acronym: string; canvasConfigured: boolean; llmConfigured: boolean }> }
  | { error: string }
> {
  try {
    await requireOwner();
    const statuses = acronyms.map((raw) => {
      const code = raw.trim().toUpperCase();
      return {
        acronym: code,
        canvasConfigured:
          !!process.env[`${code}_CANVAS_URL`] && !!process.env[`${code}_CANVAS_API_TOKEN`],
        llmConfigured: !!process.env[`${code}_LLM_URL`] && !!process.env[`${code}_LLM_API`],
      };
    });
    return { statuses };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not check institutions." };
  }
}

/**
 * Every institution the server actually has Canvas credentials for, derived
 * from the `<ACRONYM>_CANVAS_URL` / `<ACRONYM>_CANVAS_API_TOKEN` env vars. This
 * is the ONLY institution list available server-side (the acronym registry
 * otherwise lives in client localStorage), so it is what "all institutions"
 * options resolve to for unattended runs and event triggers.
 */
export async function listConfiguredInstitutionsAction(): Promise<
  { acronyms: string[] } | { error: string }
> {
  try {
    await requireOwner();
    const acronyms = new Set<string>();
    for (const key of Object.keys(process.env)) {
      const m = /^([A-Z][A-Z0-9]*)_CANVAS_URL$/.exec(key);
      if (!m) continue;
      const code = m[1];
      if (process.env[key] && process.env[`${code}_CANVAS_API_TOKEN`]) {
        acronyms.add(code);
      }
    }
    // Also include hardcoded institutions that derive their host and so work
    // with only a token set (no `<CODE>_CANVAS_URL`); env scanning alone would
    // miss them, making "all institutions" narrower than what actually works.
    for (const code of listPreconfiguredInstitutionCodes()) {
      acronyms.add(code);
    }
    return { acronyms: [...acronyms].sort() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list institutions." };
  }
}

/**
 * Build the grading queue across the given institution acronyms: assignments and
 * graded discussions that currently have submissions needing grading, with their
 * description and rubric. Per-institution failures are reported, not fatal.
 */
export async function listGradingQueueAction(
  acronyms: string[]
): Promise<
  { rows: CanvasQueueItem[]; errors: Array<{ acronym: string; error: string }> } | { error: string }
> {
  try {
    await requireOwner();
    const rows: CanvasQueueItem[] = [];
    const errors: Array<{ acronym: string; error: string }> = [];
    await Promise.all(
      acronyms.map(async (raw) => {
        const code = raw.trim().toUpperCase();
        if (!code) return;
        try {
          rows.push(...(await listGradingQueue(code)));
        } catch (err) {
          errors.push({
            acronym: code,
            error: err instanceof Error ? err.message : "Failed to load.",
          });
        }
      })
    );
    rows.sort(
      (a, b) =>
        a.institution.localeCompare(b.institution) ||
        a.courseName.localeCompare(b.courseName) ||
        a.title.localeCompare(b.title)
    );
    return { rows, errors };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the grading queue." };
  }
}

/**
 * Per-institution notification counts for the tab + switcher badges: submissions
 * needing grading and unread inbox messages. Per-institution failures degrade to
 * 0 so one misconfigured school doesn't blank every badge.
 */
/** The user's seen assignments and unwatched courses, for filtering the feed. */
export async function listGradingDismissalsAction(): Promise<
  | {
      assignments: Array<{ institution: string; refId: string }>;
      courses: Array<{ institution: string; refId: string }>;
    }
  | { error: string }
> {
  try {
    const user = await requireOwner();
    const all = await listDismissals(user.id);
    return {
      assignments: all
        .filter((d) => d.scope === "assignment")
        .map((d) => ({ institution: d.institution, refId: d.refId })),
      courses: all
        .filter((d) => d.scope === "course")
        .map((d) => ({ institution: d.institution, refId: d.refId })),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load your grading preferences." };
  }
}

/** Mark an assignment seen (hide it from the feed/badge), or undo that. */
export async function setAssignmentSeenAction(
  institution: string,
  assignmentId: string,
  seen: boolean
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const code = institution.trim().toUpperCase();
    if (seen) await addDismissal(user.id, "assignment", code, assignmentId);
    else await removeDismissal(user.id, "assignment", code, assignmentId);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the assignment." };
  }
}

/** Stop watching a course (no more notifications for it), or resume watching. */
export async function setCourseWatchedAction(
  institution: string,
  courseId: string,
  watched: boolean
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const code = institution.trim().toUpperCase();
    // "not watched" is stored as a 'course' dismissal.
    if (!watched) await addDismissal(user.id, "course", code, courseId);
    else await removeDismissal(user.id, "course", code, courseId);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the course." };
  }
}

export async function getInstitutionCountsAction(
  acronyms: string[]
): Promise<
  { counts: Array<{ acronym: string; needsGrading: number; unread: number }> } | { error: string }
> {
  try {
    const user = await requireOwner();
    // Exclude assignments marked "seen" and courses the user stopped watching so
    // the badge matches the filtered Live Feed.
    const dismissals = await listDismissals(user.id);
    const assignmentsByCode = new Map<string, Set<string>>();
    const coursesByCode = new Map<string, Set<string>>();
    for (const d of dismissals) {
      const map = d.scope === "assignment" ? assignmentsByCode : coursesByCode;
      const set = map.get(d.institution) ?? new Set<string>();
      set.add(d.refId);
      map.set(d.institution, set);
    }
    const counts = await Promise.all(
      acronyms.map(async (raw) => {
        const code = raw.trim().toUpperCase();
        if (!code) return { acronym: code, needsGrading: 0, unread: 0 };
        const exclude = {
          courses: coursesByCode.get(code),
          assignments: assignmentsByCode.get(code),
        };
        const [needsGrading, unread] = await Promise.all([
          getNeedsGradingCount(code, exclude).catch(() => 0),
          getUnreadCount(code).catch(() => 0),
        ]);
        return { acronym: code, needsGrading, unread };
      })
    );
    return { counts };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load notification counts." };
  }
}

/**
 * Unread inbox counts only — cheap (one call per school), for refreshing the
 * Communications badge after read/archive without re-running the needs-grading scan.
 */
export async function getUnreadCountsAction(
  acronyms: string[]
): Promise<{ counts: Array<{ acronym: string; unread: number }> } | { error: string }> {
  try {
    await requireOwner();
    const counts = await Promise.all(
      acronyms.map(async (raw) => {
        const code = raw.trim().toUpperCase();
        if (!code) return { acronym: code, unread: 0 };
        const unread = await getUnreadCount(code).catch(() => 0);
        return { acronym: code, unread };
      })
    );
    return { counts };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load unread counts." };
  }
}

// Grade a submissions zip with the deterministic ("Other") grading service.
// Shared by the uploaded-zip path and the Canvas path (which synthesizes a zip).
async function gradeZipViaEngine(
  zipBase64: string,
  rubric: string,
  rubricFile: File | null,
  institutionCode?: string,
  // Canvas points_possible when grading from a Canvas URL; null for zip uploads.
  pointsPossible: number | null = null
): Promise<GradeActionState> {
  let rubricText = "";
  let rubricName: string | undefined;
  if (rubricFile && rubricFile.size > 0) {
    rubricText = await rubricFile.text();
    rubricName = rubricFile.name;
  } else if (rubric.trim()) {
    rubricText = rubric;
  }
  if (!rubricText.trim()) {
    return {
      run: null,
      error:
        "Provide a rubric (upload a CSV/JSON file or paste one) to grade with the deterministic grader.",
    };
  }
  const resp = await gradeViaGradingEngine(
    zipBase64,
    detectRubricSource(rubricText, rubricName),
    institutionCode
  );
  const warnings = [
    ...resp.warnings,
    ...(resp.unmapped_criteria?.length
      ? [`Excluded (unmapped): ${resp.unmapped_criteria.join(", ")}`]
      : []),
  ];
  return { run: gradingApiToRun(resp, pointsPossible), error: null, warnings };
}

/** Run every entry's code in the sandbox (sequential, to respect Piston rate
 *  limits) and stash the result on the entry so the embedded engine can score it
 *  without doing any network itself. Entries with no runnable code get null. */
async function attachCodeRuns(entries: StudentSubmissionEntry[]): Promise<void> {
  for (const entry of entries) {
    entry.codeRun = await runSubmittedCode(entry.submittedFiles);
  }
}

export async function gradeAction(
  _prev: GradeActionState,
  formData: FormData
): Promise<GradeActionState> {
  const file = formData.get("studentSubmissions") as File | null;
  const canvasUrl = ((formData.get("canvasUrl") as string | null) ?? "").trim();
  const assignmentInstructions =
    (formData.get("assignmentInstructions") as string | null) ?? "";
  const rubric = (formData.get("rubric") as string | null) ?? "";
  const provider = normalizeProvider(formData.get("provider") as string | null);
  const rubricFile = formData.get("rubricFile") as File | null;
  // Optional institution acronym (Live Feed Auto Grade) — routes the
  // deterministic grader to that school's endpoint; blank uses the global one.
  const institution = ((formData.get("institution") as string | null) ?? "").trim() || undefined;

  try {
    await requireOwner();

    // Canvas source: grade each student's discussion posts or assignment
    // submission (kind auto-detected from the URL). Routes by provider — the
    // deterministic grader gets a synthesized zip; Gemini grades the text/files.
    if (canvasUrl) {
      // SpeedGrader base URL for per-student deep links in the results table.
      // Best-effort: a failure here must not block grading.
      const speedGraderUrl = await getSpeedGraderUrl(canvasUrl).catch(() => null);

      if (provider === "other") {
        const [{ students }, pointsPossible] = await Promise.all([
          fetchCanvasWork(canvasUrl),
          fetchAssignmentPointsPossible(canvasUrl),
        ]);
        // Everything that came back is already graded (or there is nothing to
        // grade): return an empty run so the UI shows its "nothing left" state
        // instead of sending an empty archive to the engine.
        if (students.length === 0) {
          return { run: { results: [], rubricAreaNames: [], fullCreditChecklist: [], speedGraderUrl }, error: null };
        }
        const zipBase64 = await canvasWorkToZipBase64(students);
        const state = await gradeZipViaEngine(zipBase64, rubric, rubricFile, institution, pointsPossible);
        return state.run ? { ...state, run: { ...state.run, speedGraderUrl } } : state;
      }

      // Embedded Deterministic Engine: grade in-process against the Canvas rubric
      // when one is present, otherwise a rubric generated from the instructions.
      if (provider === "embedded") {
        // Discussions are graded on participation/engagement signals, not the
        // generic file/keyword checks, so route them to the discussion grader.
        if (detectCanvasUrlKind(canvasUrl) === "discussion") {
          const [{ students, dueAt }, pointsPossible] = await Promise.all([
            fetchCanvasWork(canvasUrl),
            fetchAssignmentPointsPossible(canvasUrl),
          ]);
          const discussionStudents = students
            .filter((s) => s.discussion)
            .map((s) => ({ student: s.student, userId: s.userId, activity: s.discussion! }));
          if (discussionStudents.length === 0) {
            return { run: { results: [], rubricAreaNames: [], fullCreditChecklist: [], speedGraderUrl }, error: null };
          }
          const participants = students.map((s) => ({ userId: s.userId, name: s.student }));
          const source = [assignmentInstructions, rubric].filter((t) => t.trim()).join("\n");
          const discussionRubric = buildDiscussionRubric(source);
          const run = gradeDiscussion(discussionStudents, discussionRubric, { dueAt, participants }, pointsPossible);
          return {
            run: { ...run, speedGraderUrl },
            error: null,
            warnings: discussionRubric.warnings,
            generatedRubric: renderDiscussionRubric(discussionRubric),
          };
        }

        const { entries, pointsPossible } = await extractCanvasEntries(canvasUrl);
        if (entries.length === 0) {
          return { run: { results: [], rubricAreaNames: [], fullCreditChecklist: [], speedGraderUrl }, error: null };
        }
        const builtRubric = buildEmbeddedRubric({ rubricText: rubric, instructions: assignmentInstructions });
        if (builtRubric.checks.length === 0) {
          return { run: null, error: builtRubric.warnings[0] ?? "Provide a rubric or assignment instructions." };
        }
        // Grow the rubric bank from human-authored rubrics (fire-and-forget).
        if (rubric.trim()) void rememberRubric(assignmentInstructions, rubric);
        await attachCodeRuns(entries);
        const run = gradeEntriesEmbedded(entries, builtRubric, pointsPossible);
        return {
          run: { ...run, speedGraderUrl },
          error: null,
          warnings: builtRubric.warnings.length ? builtRubric.warnings : undefined,
          generatedRubric: builtRubric.origin === "instructions" ? renderRubricText(builtRubric) : undefined,
        };
      }

      if (!assignmentInstructions.trim()) {
        return { run: null, error: "Please provide assignment instructions." };
      }
      // No rubric synthesis on the Canvas path: grade with whatever rubric was
      // retrieved from Canvas (may be empty), using the instructions otherwise.
      const [run, fullCreditChecklist, sampleAnswer] = await Promise.all([
        gradeCanvasUrl(canvasUrl, assignmentInstructions, rubric, provider),
        synthesizeFullCreditChecklist(assignmentInstructions, rubric, provider),
        generateSampleAnswer(assignmentInstructions, rubric, provider),
      ]);
      return { run: { ...run, fullCreditChecklist, sampleAnswer, speedGraderUrl }, error: null };
    }

    if (!file || file.size === 0) {
      return { run: null, error: "Please upload a student submissions zip file." };
    }

    // Deterministic Grading API path (provider toggle = "other").
    if (provider === "other") {
      const zipBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
      return gradeZipViaEngine(zipBase64, rubric, rubricFile, institution);
    }

    // Embedded Deterministic Engine path (provider toggle = "embedded"). Grades
    // in-process against a supplied rubric, or one generated from the instructions.
    if (provider === "embedded") {
      const entries = await extractStudentEntries(await file.arrayBuffer());
      if (entries.length === 0) {
        return { run: { results: [], rubricAreaNames: [], fullCreditChecklist: [] }, error: null };
      }
      const rubricText = rubricFile && rubricFile.size > 0 ? await rubricFile.text() : rubric;
      const rubricName = rubricFile && rubricFile.size > 0 ? rubricFile.name : undefined;
      const builtRubric = buildEmbeddedRubric({
        rubricText,
        rubricFileName: rubricName,
        instructions: assignmentInstructions,
      });
      if (builtRubric.checks.length === 0) {
        return { run: null, error: builtRubric.warnings[0] ?? "Provide a rubric or assignment instructions." };
      }
      // Grow the rubric bank from human-authored rubrics (fire-and-forget).
      if (rubricText.trim()) void rememberRubric(assignmentInstructions, rubricText);
      await attachCodeRuns(entries);
      const run = gradeEntriesEmbedded(entries, builtRubric);
      return {
        run,
        error: null,
        warnings: builtRubric.warnings.length ? builtRubric.warnings : undefined,
        generatedRubric: builtRubric.origin === "instructions" ? renderRubricText(builtRubric) : undefined,
      };
    }

    // Gemini path.
    if (!assignmentInstructions.trim()) {
      return { run: null, error: "Please provide assignment instructions." };
    }

    const effectiveRubric = rubric.trim()
      ? rubric
      : await generateRubric(assignmentInstructions, provider);
    const generatedRubric = rubric.trim() ? undefined : effectiveRubric;

    const zipBuffer = await file.arrayBuffer();
    const [run, fullCreditChecklist, sampleAnswer] = await Promise.all([
      gradeSubmissions(zipBuffer, assignmentInstructions, effectiveRubric, provider),
      synthesizeFullCreditChecklist(assignmentInstructions, effectiveRubric, provider),
      generateSampleAnswer(assignmentInstructions, effectiveRubric, provider),
    ]);

    return {
      run: {
        ...run,
        fullCreditChecklist,
        sampleAnswer,
      },
      error: null,
      generatedRubric,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return { run: null, error: message };
  }
}

export interface SelectionChatMessage {
  role: "user" | "model";
  text: string;
}

export async function selectionChatAction(
  selectedText: string,
  question: string,
  history: SelectionChatMessage[],
  sessionId: string,
  provider: LlmProvider = "gemini"
): Promise<string | { error: string }> {
  try {
    // Embedded Deterministic Engine: the ask-anything router handles the
    // request with the highlighted text as primary context — Q&A over the
    // selection (with conversational follow-ups and glossary-backed
    // definitions), plus every other intent (rubric, quiz on the selection,
    // practice problems, case study, announcement). No model call, no external
    // web. The exchange is logged the same way as the LLM path.
    if (provider === "embedded") {
      const replyText = (await routeRequest(question, history, { contextText: selectedText })).reply;
      let embeddedUserId: string | undefined;
      try {
        const supabase = await createClient();
        const { data: session } = await supabase.auth.getUser();
        embeddedUserId = session.user?.id;
      } catch {
        // Non-fatal — continue without a user ID.
      }
      void logChatExchange({
        sessionId,
        source: "selection",
        userMessage: question,
        assistantReply: replyText,
        contextText: selectedText,
        userId: embeddedUserId,
      });
      return replyText;
    }

    const systemPrompt = `You are a helpful teaching assistant. The user has highlighted the following text and has a question about it. Answer concisely and helpfully. Use plain prose only — do not use any markdown formatting, bold, italics, bullet points, headers, or special symbols.

HIGHLIGHTED TEXT:
"""
${selectedText}
"""`;

    const contents = [
      { role: "user" as const, parts: [{ text: systemPrompt }] },
      { role: "model" as const, parts: [{ text: "Understood. I'll answer questions about the highlighted text in plain prose with no formatting." }] },
      ...history.map((m) => ({ role: m.role as "user" | "model", parts: [{ text: m.text }] })),
      { role: "user" as const, parts: [{ text: question }] },
    ];

    const result = await callLlm(
      {
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Chat failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const replyText = result.text || "No response from the model.";

    // Log the user message and assistant reply to the database (non-blocking).
    let userId: string | undefined;
    try {
      const supabase = await createClient();
      const { data: session } = await supabase.auth.getUser();
      userId = session.user?.id;
    } catch {
      // Non-fatal — continue without a user ID.
    }

    void logChatExchange({
      sessionId,
      source: "selection",
      userMessage: question,
      assistantReply: replyText,
      contextText: selectedText,
      userId,
    });

    return replyText;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

export interface CourseScheduleRow {
  week: number;
  dates: string;
  topics: string;
  assignment: string;
}

export interface CourseScheduleResult {
  rows: CourseScheduleRow[];
  topics?: string[];
}

// Format the Monday–Friday range for week N (1-based) starting from an ISO
// date (YYYY-MM-DD), e.g. "Aug 25 – Aug 29". Used when the Course Engine
// schedule endpoint supplies topics but no calendar dates (Gemini does both).
function weekDateRange(startISO: string, weekNumber: number): string {
  if (!startISO) return "";
  const start = new Date(`${startISO}T00:00:00`);
  if (Number.isNaN(start.getTime())) return "";

  // Snap to the Monday of the start week, then advance to the requested week.
  const day = start.getDay(); // 0 Sun … 6 Sat
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(start);
  monday.setDate(start.getDate() + mondayOffset + (weekNumber - 1) * 7);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(monday)} – ${fmt(friday)}`;
}

// Adapt the Course Engine schedule response to the CourseScheduleRow shape the
// UI already renders. The endpoint provides per-week topics + citations but no
// dates or per-week assignments, so dates are derived locally and assignment is
// left blank.
function scheduleResponseToRows(
  resp: ScheduleResponse,
  startingDate: string
): CourseScheduleRow[] {
  return (resp.weeks ?? []).map((w) => ({
    week: w.week,
    dates: weekDateRange(startingDate, w.week),
    topics: (w.topics ?? []).join(", "),
    assignment: "",
  }));
}

export async function generateCourseScheduleAction(
  courseDescription: string,
  term: string,
  startingDate: string,
  numberOfWeeks: number | null,
  numberOfTests: number | null,
  provider: LlmProvider = "gemini"
): Promise<CourseScheduleResult | { error: string }> {
  try {
    const topicsOnly = !term.trim() && !startingDate && numberOfWeeks === null && numberOfTests === null;

    if (topicsOnly) {
      if (provider === "other") {
        const resp = await courseEngineSchedule(courseDescription.trim(), 15);
        const rows = scheduleResponseToRows(resp, "");
        const topics = rows.flatMap((r) => r.topics.split(", ")).filter(Boolean);
        return { rows: [], topics };
      }

      if (provider === "embedded") {
        const rows = scaffoldCourseSchedule(courseDescription, "", 15, 0);
        const topics = rows.flatMap((r) => r.topics.split(", ")).filter(Boolean);
        return { rows: [], topics };
      }

      const prompt = `You are an expert curriculum designer. Given this course description, return ONLY a JSON array of strings — the ordered list of topics the course should cover, one concise topic per entry (8–30 topics depending on scope). No numbering in the strings, no markdown.

COURSE DESCRIPTION:
${courseDescription}

Return ONLY valid JSON in this exact format:
["Topic 1", "Topic 2", "Topic 3", ...]`;

      const parts: Array<{ text: string }> = [
        { text: prompt },
      ];

      const llmResult = await callLlm(
        {
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
        },
        provider
      );

      if (!llmResult.ok) {
        return { error: `Topics generation failed: HTTP ${llmResult.status} — ${llmResult.body.slice(0, 200)}` };
      }

      const parsed = parseLenientJsonArray(llmResult.text);
      if (!parsed) {
        return { error: "Could not parse topics from the model response." };
      }

      const topics = parsed
        .filter((t) => typeof t === "string")
        .map((t) => (t as string).trim())
        .filter(Boolean);

      if (topics.length === 0) {
        return { error: "The model produced no usable topics." };
      }

      return { rows: [], topics };
    }

    const weeks = numberOfWeeks ?? 15;
    const tests = numberOfTests ?? 0;
    const useToday = !startingDate;
    const dateForSchedule = useToday ? new Date().toISOString().split("T")[0] : startingDate;

    if (provider === "other") {
      const resp = await courseEngineSchedule(courseDescription.trim(), weeks);
      let rows = scheduleResponseToRows(resp, dateForSchedule);
      if (useToday) {
        rows = rows.map((r) => ({ ...r, dates: "" }));
      }
      return { rows };
    }

    if (provider === "embedded") {
      let rows = scaffoldCourseSchedule(courseDescription, dateForSchedule, weeks, tests);
      if (useToday) {
        rows = rows.map((r) => ({ ...r, dates: "" }));
      }
      return { rows };
    }

    const termLine = term.trim() ? `\nTERM: ${term}` : "";
    const dateInstruction = startingDate
      ? `COURSE START DATE: ${startingDate}`
      : "No start date was provided - use week numbers only and leave the dates field an empty string";

    const prompt = `You are an expert curriculum designer creating a weekly course schedule.

COURSE DESCRIPTION:
${courseDescription}${termLine}
${dateInstruction}
NUMBER OF WEEKS: ${weeks}
NUMBER OF TESTS: ${tests}

Generate a complete ${weeks}-week course schedule. Distribute ${tests} test(s) logically across the schedule (e.g. after major topic blocks).${startingDate ? ` Calculate actual date ranges for each week starting from the provided start date (Monday–Friday format, e.g. "Aug 25 – Aug 29").` : ""} Every week should have instructional content — do not include break weeks or non-instruction weeks.

Return ONLY valid JSON in this exact format:
{
  "rows": [
    { "week": 1, "dates": "...", "topics": "...", "assignment": "..." },
    ...
  ]
}

Requirements:
- Include exactly ${weeks} rows (one per week).
- "week" is the week number (1-based integer).
- "dates" is the date range for that week (e.g. "Aug 25 – Aug 29")${startingDate ? "." : " or empty string if no start date was provided."}"
- "topics" describes the main subject(s) covered that week; for test weeks include "Test${tests > 1 ? " N" : ""}" alongside the topic.
- "assignment" is a brief description of the homework or activity due that week; write "Test" for test weeks.
- Space the ${tests} test(s) evenly across the schedule, placing them at the end of major topic blocks.
- Each test week must be immediately preceded by a review week (e.g. "Review" or "Review: [topic]").
- No new topics are introduced in review weeks or test weeks; these weeks consolidate previously covered material.
- Do not include any text outside the JSON object.`;

    const parts: Array<{ text: string }> = [
      { text: prompt },
    ];

    const result = await callLlm(
      {
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Schedule generation failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const raw = result.text;

    const jsonText = jsonObjectSlice(raw);
    if (!jsonText) {
      return { error: "Could not parse the schedule from the model response." };
    }

    const parsed = JSON.parse(jsonText) as {
      rows?: Array<{ week?: unknown; dates?: unknown; topics?: unknown; assignment?: unknown }>;
    };

    if (!parsed.rows || !Array.isArray(parsed.rows)) {
      return { error: "Model did not return a valid schedule." };
    }

    const rows: CourseScheduleRow[] = parsed.rows
      .filter((r) => typeof r.week === "number" || typeof r.week === "string")
      .map((r) => ({
        week: typeof r.week === "number" ? r.week : parseInt(String(r.week), 10),
        dates: typeof r.dates === "string" ? r.dates : "",
        topics: typeof r.topics === "string" ? r.topics : "",
        assignment: typeof r.assignment === "string" ? r.assignment : "",
      }));

    return { rows };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

export async function generateCopilotProjectPromptAction(
  fileContent: string,
  fileName: string,
  provider: LlmProvider = "gemini"
): Promise<{ prompt: string } | { error: string }> {
  try {
    if (provider === "other") {
      const resp = await courseEngineCopilotPrompt(fileContent, fileName);
      return resp.prompt
        ? { prompt: resp.prompt }
        : { error: "Course Engine returned an empty prompt." };
    }

    // Embedded Deterministic Engine: template a Copilot prompt from the schedule
    // with no model call.
    if (provider === "embedded") {
      return { prompt: scaffoldCopilotPrompt(fileContent, fileName) };
    }

    const prompt = `You are an expert software engineering educator. A teacher has provided a course schedule (as a CSV or text file) and wants to create a hands-on software project that gives students practice with every topic and assignment in the course.

FILE NAME: ${fileName}

SCHEDULE CONTENT:
${fileContent}

Your task: Write a detailed GitHub Copilot prompt that the teacher can paste into GitHub Copilot (Agent mode) to scaffold a complete software project.

Before writing the prompt, analyze the schedule to identify:
1. Which weeks are review weeks (weeks with titles like "Review", "Exam Review", "Midterm Review", etc.) and what topics from prior weeks they cover.
2. Which weeks are test/exam weeks (weeks with titles like "Midterm", "Final", "Exam", "Quiz", etc.) and what topics those assessments cover.
3. The primary programming language and domain of the course (e.g., Python → data science; JavaScript → web development; Java → enterprise/Android; R → statistics/data analysis; SQL → data engineering) so the project can showcase skills that employers in that domain commonly want.

The project must:
- Be themed around employer-relevant skills for the course's language and domain (e.g., a data science pipeline and dashboard for Python courses, a full-stack web app for JavaScript courses, an Android app for Java courses) so students can showcase the project to prospective employers
- Include a frontend (a web UI, dashboard, or interactive interface) that is part of the project repository and deployed to Vercel
- Cover every topic listed in the schedule in roughly the same order
- Reference or incorporate each assignment described in the schedule
- Be realistic and buildable by a student over the course of the term
- Use a simple tech stack that deploys to Vercel out of the box — prefer Next.js for full-stack or data-heavy courses, or a plain HTML/CSS/JavaScript static site for lighter courses. First evaluate whether the course goals can be met entirely with Next.js, Vercel, and GitHub alone (e.g., static data, local state, file-based storage, or Vercel Edge/API routes). Only introduce additional services if the course goals genuinely cannot be achieved without them (for example, if the course requires a persistent relational database, real-time data, or authentication across users). When additional services are necessary, prioritize free tiers of tools that integrate natively with Vercel and GitHub — such as Supabase (PostgreSQL database, auth, storage, and realtime, with first-class Vercel and GitHub integrations and a generous free tier) — over self-hosted or paid infrastructure. Avoid any service that requires DevOps experience, paid plans at student scale, or complex setup beyond clicking "Connect to Vercel" in a dashboard. The architecture must be something a beginner can fork, deploy, and iterate on with zero DevOps experience

Assignment structure rules — the prompt MUST specify all of the following:
- There must be an "assignment0" folder that serves as an onboarding exercise. This assignment must walk students step-by-step through: (1) forking the repository, (2) deploying the fork to Vercel and getting a live preview URL, (3) creating a new branch, (4) opening the branch in GitHub Codespaces, (5) making a simple code change (e.g., changing a variable in a designated file to their own name so their name appears in the frontend), (6) running the unit tests for assignment0 using the Testing panel in GitHub Codespaces (not the terminal), (7) committing the change using the Source Control panel in GitHub Codespaces (not the terminal), (8) pushing the branch using the Source Control panel in GitHub Codespaces (not the terminal), (9) opening a pull request using the GitHub website, (10) verifying the Vercel preview deployment on the PR, (11) merging the PR using the GitHub website. The instructions for this assignment must be in assignment0/INSTRUCTIONS.md.
- Every assignment folder (assignment0, assignment1, assignment2, …) must live inside a single root-level "assignments/" directory (e.g., assignments/assignment0/, assignments/assignment1/, etc.). No assignment folder should exist outside of this directory.
- In each assignment folder there must be exactly ONE file that students edit to complete the assignment. All other files in the folder must be read-only scaffolding. The prompt must name the file students edit.
- Each assignment folder must contain an INSTRUCTIONS.md file with verbose, beginner-friendly instructions for that assignment, including several worked examples that illustrate the concepts WITHOUT giving away the solution. Examples should use different scenarios or data than the actual assignment tasks. All instructions throughout every INSTRUCTIONS.md file must guide students to use GitHub and GitHub Codespaces graphical interfaces (e.g., the Source Control panel for committing and pushing, the Testing panel for running tests, the GitHub website for pull requests and merging) rather than terminal commands wherever possible. Any step that can be accomplished through a UI must describe how to do so through the UI and must NOT instruct students to open the terminal.
- Each assignment folder must contain unit tests (e.g., test_assignment{N}.py, assignment{N}.test.js, etc.) that verify the student's implementation. Tests must import/require only the one file the student edits.
- The assignment files must be wired into the frontend so that the very act of a student completing their one editable assignment file — and nothing else — automatically unlocks the corresponding feature on the frontend. Students must NOT need to edit any configuration files, environment variables, feature flags, or any file outside their assignment folder for the unlock to take effect. The integration must work by having the frontend directly import or dynamically read only the student's assignment file at build or runtime (for example, the frontend imports the student's module and checks whether the exported function/class returns non-trivial output, or reads a value the student set). The prompt must specify this mechanism precisely: name the exact import/read path for each assignment file, describe what the frontend checks, and show how the UI state changes when the check passes. No manual wiring step should ever be required of the student beyond completing the assignment file itself.
- Review weeks (identified from the schedule) must have their own full assignment folder named "reviewN" containing: an INSTRUCTIONS.md with review guide and study materials describing exactly which topics and assignments are covered, one editable file students complete as a review exercise, unit tests that verify the review exercise, and the same frontend-unlock wiring as regular assignments. All instructions must follow the no-terminal rule above.
- Test/exam weeks (identified from the schedule) must also have their own full assignment folder named "examN" (or "midterm", "final", etc.) containing: an INSTRUCTIONS.md that describes the topics assessed and provides a practice exercise mirroring the exam format, one editable file students complete as a practice exercise, unit tests that verify the practice exercise, and the same frontend-unlock wiring as regular assignments. The project README must also note these weeks and the topics they assess. All instructions must follow the no-terminal rule above.

The prompt you write should be self-contained — someone should be able to paste it directly into GitHub Copilot Agent mode and get a fully scaffolded project back. Be specific about: the repository's top-level file structure, each assignment folder's contents (listing every file by name), the frontend framework and how it is structured, the Vercel configuration, how assignment completion unlocks frontend features, and how the project evolves week by week to match the schedule.

Return ONLY the prompt text — no preamble, no explanation, no markdown code fences. Just the raw prompt the teacher will paste into GitHub Copilot.`;

    const llmResult = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
      },
      provider
    );

    if (!llmResult.ok) {
      return { error: `Prompt generation failed: HTTP ${llmResult.status} — ${llmResult.body.slice(0, 200)}` };
    }

    const generated = llmResult.text;

    if (!generated.trim()) {
      return { error: "The model did not return a prompt. Please try again." };
    }

    return { prompt: generated.trim() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

export async function generateCourseProjectRubricAction(
  fileContent: string,
  fileName: string,
  provider: LlmProvider = "gemini"
): Promise<{ rubric: string } | { error: string }> {
  try {
    // Embedded Deterministic Engine: a fixed, broadly-applicable rubric, no model.
    if (provider === "embedded") {
      return { rubric: scaffoldCourseProjectRubric() };
    }

    const prompt = `You are an expert educator. A teacher has provided a course schedule and wants a single universal grading rubric that can be applied consistently to every assignment in the course.

FILE NAME: ${fileName}

SCHEDULE CONTENT:
${fileContent}

Based on the course schedule above, identify the overall learning goals and skills students are expected to develop across all assignments. Then create a single, course-wide grading rubric that applies fairly to every assignment regardless of topic.

The rubric must have exactly:
- 3 criteria (rows), each tied to a skill or quality that every assignment can be assessed against
- 3 performance levels (columns): Excellent, Satisfactory, Needs Improvement
- A total of exactly 100 points distributed across the 3 criteria (you may choose any reasonable point weights that sum to 100, e.g. 40/30/30 or 35/35/30)

Return ONLY valid JSON in this exact shape:
{
  "rubric": {
    "criteria": [
      {
        "name": "...",
        "points": <number>,
        "levels": {
          "excellent": { "score": <number>, "description": "..." },
          "satisfactory": { "score": <number>, "description": "..." },
          "needsImprovement": { "score": <number>, "description": "..." }
        }
      }
    ]
  }
}

Rules:
- Each criterion's "points" is the maximum points for that criterion; the three "points" values must sum to exactly 100.
- For each criterion: excellent.score == points, satisfactory.score == roughly 75% of points (round to nearest whole number), needsImprovement.score == roughly 50% of points (round to nearest whole number).
- Criteria must be broadly applicable to every assignment (e.g. "Technical Correctness", "Code Quality / Clarity", "Completeness & Requirements"). Adapt the names to match the course domain.
- Descriptions must be specific enough to be actionable but general enough to apply to any assignment in the course.
- IMPORTANT: Every criterion must evaluate only the presence or absence of things in the submitted code itself (e.g. specific functions, classes, variables, logic, structure, or required features). Do NOT include criteria that require running tests, checking commits, verifying deployments, or evaluating anything outside the code files themselves.
- Do not include any text outside the JSON object.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1500 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Rubric generation failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const raw = result.text;

    if (!raw.trim()) {
      return { error: "The model did not return a rubric. Please try again." };
    }

    // Extract JSON
    const jsonText = jsonObjectSlice(raw);
    if (!jsonText) {
      return { error: "Could not parse rubric from the model response." };
    }

    const parsed = JSON.parse(jsonText) as {
      rubric?: {
        criteria?: Array<{
          name?: string;
          points?: number;
          levels?: {
            excellent?: { score?: number; description?: string };
            satisfactory?: { score?: number; description?: string };
            needsImprovement?: { score?: number; description?: string };
          };
        }>;
      };
    };

    const criteria = parsed.rubric?.criteria;
    if (!Array.isArray(criteria) || criteria.length === 0) {
      return { error: "Could not parse rubric criteria from the model response." };
    }

    // Format as readable text
    const lines: string[] = ["COURSE-WIDE GRADING RUBRIC (100 points)\n"];
    lines.push(
      ["Criterion", "Excellent", "Satisfactory", "Needs Improvement"]
        .map((h) => h.padEnd(28))
        .join(" | ")
    );
    lines.push("-".repeat(110));
    for (const c of criteria) {
      const name = `${c.name ?? "Criterion"} (${c.points ?? "?"}pts)`;
      const ex = `${c.levels?.excellent?.score ?? "?"} pts — ${c.levels?.excellent?.description ?? ""}`;
      const sat = `${c.levels?.satisfactory?.score ?? "?"} pts — ${c.levels?.satisfactory?.description ?? ""}`;
      const ni = `${c.levels?.needsImprovement?.score ?? "?"} pts — ${c.levels?.needsImprovement?.description ?? ""}`;
      lines.push(`\n${name}`);
      lines.push(`  Excellent:         ${ex}`);
      lines.push(`  Satisfactory:      ${sat}`);
      lines.push(`  Needs Improvement: ${ni}`);
    }

    return { rubric: lines.join("\n") };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

// ── Lecture Planning ─────────────────────────────────────────────────────────

export interface AssignmentPlan {
  assignmentName: string;
  // Human-readable, unique label derived from the folder slug (e.g. "Review 1",
  // "Assignment 3"). Used for file names and the editor header so two folders
  // with the same number (assignment1 / review1 / exam1) never collide.
  label: string;
  presentationTitle: string;
  slides: SlideData[];
  // True when slide generation failed for this assignment after retries, so the
  // deck above is an empty placeholder. The UI surfaces this so the instructor
  // can regenerate rather than silently shipping a blank deck.
  slidesFailed?: boolean;
  moduleIntroduction: string;
  assignmentInstructions: string;
  // Normalized week number (1-based) aligned with the course schedule. Zero-based
  // folder sets (week-00, week-01, ...) are shifted up by one; 1-based sets keep
  // their numbers exactly (gaps preserved, no compaction). A folder without digits
  // falls back to its own position in the sorted list.
  weekNumber: number;
  // The exact heading lines found in the supplied templates (paragraphs styled
  // as headings/titles in the .docx). When a template is provided, only these
  // lines may receive heading formatting in the generated document — body text
  // must never be promoted to a heading. Empty when no template was supplied.
  introTemplateHeadings: string[];
  instructionsTemplateHeadings: string[];
}

// Extract plain text from a base64-encoded .docx template (best effort).
// Paragraphs that use Word's native list/bullet formatting (a <w:numPr>
// element in the paragraph properties, or a list-style paragraph style) are
// emitted with an explicit "- " (bulleted) or "1. " (numbered) marker so the
// downstream AI sees — and reproduces — the template's bullet structure. Word
// stores list formatting structurally, not as literal characters, so without
// this step bullets are silently lost when the template is flattened to text.
async function extractDocxTemplateText(base64: string): Promise<string> {
  try {
    const JSZip = (await import("jszip")).default;
    const buffer = Buffer.from(base64, "base64");
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = zip.file("word/document.xml");
    if (!documentXml) return "";
    const xml = await documentXml.async("string");

    const decodeEntities = (value: string) =>
      value
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");

    // Convert a single <w:p> paragraph block into its plain text, preserving
    // tabs and intra-paragraph line breaks.
    const paragraphText = (paragraph: string): string => {
      const withBreaks = paragraph
        .replace(/<w:tab\s*\/?>/g, "\t")
        .replace(/<w:br\s*\/?>/g, "\n")
        .replace(/<w:cr\s*\/?>/g, "\n");
      const runs = withBreaks.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) ?? [];
      const text = runs.map((run) => run.replace(/<[^>]+>/g, "")).join("");
      return decodeEntities(text);
    };

    // A paragraph is a list item when its properties contain a numbering
    // reference (<w:numPr>) or its paragraph style name looks like a list.
    const isListParagraph = (paragraph: string): boolean => {
      const props = paragraph.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
      const propsXml = props ? props[0] : "";
      if (/<w:numPr\b/.test(propsXml)) return true;
      const styleMatch = propsXml.match(/<w:pStyle\s+w:val="([^"]*)"/);
      return !!styleMatch && /list|bullet/i.test(styleMatch[1]);
    };

    // Distinguish numbered lists from bulleted ones when the numbering format
    // is discoverable; default to a bullet marker otherwise.
    const numberingXml = await zip.file("word/numbering.xml")?.async("string");
    const isNumberedList = (paragraph: string): boolean => {
      if (!numberingXml) return false;
      const numIdMatch = paragraph.match(/<w:numId\s+w:val="(\d+)"/);
      if (!numIdMatch) return false;
      const numId = numIdMatch[1];
      const numDef = numberingXml.match(
        new RegExp(`<w:num\\s+w:numId="${numId}"[\\s\\S]*?<w:abstractNumId\\s+w:val="(\\d+)"`)
      );
      if (!numDef) return false;
      const abstractId = numDef[1];
      const abstract = numberingXml.match(
        new RegExp(`<w:abstractNum\\s+w:abstractNumId="${abstractId}"[\\s\\S]*?</w:abstractNum>`)
      );
      if (!abstract) return false;
      const fmtMatch = abstract[0].match(/<w:numFmt\s+w:val="([^"]*)"/);
      return !!fmtMatch && fmtMatch[1] !== "bullet" && fmtMatch[1] !== "none";
    };

    const paragraphs = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
    const lines: string[] = [];
    let orderedCounter = 0;
    for (const paragraph of paragraphs) {
      const text = paragraphText(paragraph).trim();
      if (isListParagraph(paragraph)) {
        if (!text) continue;
        if (isNumberedList(paragraph)) {
          orderedCounter += 1;
          lines.push(`${orderedCounter}. ${text}`);
        } else {
          orderedCounter = 0;
          lines.push(`- ${text}`);
        }
      } else {
        orderedCounter = 0;
        lines.push(text);
      }
    }

    return lines
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } catch {
    return "";
  }
}

// Extract the exact heading lines from a base64-encoded .docx template by
// inspecting which paragraphs are styled as headings/titles in the document.
// This lets the generated document apply heading formatting ONLY where the
// template actually has a heading, never to ordinary body text.
async function extractDocxTemplateHeadings(base64: string): Promise<string[]> {
  try {
    const JSZip = (await import("jszip")).default;
    const buffer = Buffer.from(base64, "base64");
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = zip.file("word/document.xml");
    if (!documentXml) return [];
    const xml = await documentXml.async("string");

    const headings: string[] = [];
    const paragraphs = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
    for (const paragraph of paragraphs) {
      const styleMatch = paragraph.match(/<w:pStyle\s+w:val="([^"]*)"/);
      if (!styleMatch || !/heading|title/i.test(styleMatch[1])) continue;

      const text = (paragraph.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) ?? [])
        .map((run) => run.replace(/<[^>]+>/g, ""))
        .join("")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .trim();
      if (text) headings.push(text);
    }
    return headings;
  } catch {
    return [];
  }
}


function buildStrictTemplateBlock(templateText: string): string {
  if (!templateText.trim()) return "";
  return `\n\nSTRICT TEMPLATE TO FOLLOW (this takes ABSOLUTE PRECEDENCE over every other structural instruction in this prompt):\n${templateText}\n\nTEMPLATE RULES (mandatory):\n- Reproduce the template's exact section headings, wording of headings, and their order. Do not add, remove, rename, merge, split, or reorder any section.\n- Match the template's formatting, heading style, capitalization, numbering/bullet conventions, tone, and overall structure precisely.\n- The template marks bulleted list items with a leading "- " and numbered list items with a leading "1. ", "2. ", etc. Wherever the template uses these list markers, your output MUST use the same list markers (start each such line with "- " for bullets or "N. " for numbered items). Wherever the template uses ordinary paragraphs, keep them as paragraphs with no list marker.\n- Replace any placeholder text in the template (e.g. bracketed prompts, sample text, "TODO", "[...]") with real content tailored to this assignment.\n- Preserve any fixed/boilerplate wording in the template verbatim.\n- If a default section described elsewhere in this prompt is not present in the template, only include it if the template has a clearly appropriate place for it; otherwise omit it. The template's structure wins in every conflict.`;
}

async function generateSlidesForAssignment(
  assignmentName: string,
  content: string,
  lectureDurationMinutes: number,
  provider: LlmProvider
): Promise<{ presentationTitle: string; slides: SlideData[] } | { error: string }> {
  // Embedded Deterministic Engine: template a deck outline from the content.
  if (provider === "embedded") {
    return scaffoldLessonPlan(content);
  }

  const prompt = `You are an expert educator creating a lecture slide deck for a programming course assignment. The slides must be fully self-contained — students reading them after class must be able to understand every concept without relying on any verbal explanation from the instructor.

ASSIGNMENT: ${assignmentName}
LECTURE DURATION: ${lectureDurationMinutes} minutes

ASSIGNMENT CONTENT:
${content}

Based on the assignment content above, create a complete lecture slide deck that teaches students the concepts they need to understand and complete this assignment. Scale the number of slides to fit a ${lectureDurationMinutes}-minute lecture (roughly 1–2 minutes per slide on average).

Return ONLY valid JSON:
${SLIDE_DECK_JSON_SHAPE}

Requirements:
- Cover the concepts introduced in the README or assignment description, highlight what students must implement, and explain any relevant patterns shown in the unit tests or code comments.
${SLIDE_STRUCTURE_REQUIREMENTS}`;

  // The parse below is guarded and retried once because a thrown parse error
  // would bypass buildAssignmentPlan's slidesFailed tolerance and fail the
  // entire generation run.
  let parsed: {
    presentationTitle?: string;
    slides?: Array<{ title?: string; bullets?: string[]; code?: string; codeLanguage?: string }>;
  } | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 12288 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `LLM API error for "${assignmentName}": HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const jsonText = jsonObjectSlice(result.text);
    if (!jsonText) {
      if (attempt === 1) {
        console.error(`Slide JSON parse failed for "${assignmentName}" (attempt 1): no JSON object in the response`);
        continue;
      }
      return { error: `Could not parse slide data for "${assignmentName}".` };
    }

    try {
      parsed = JSON.parse(jsonText) as {
        presentationTitle?: string;
        slides?: Array<{ title?: string; bullets?: string[]; code?: string; codeLanguage?: string }>;
      };
      break;
    } catch (err) {
      if (attempt === 1) {
        console.error(
          `Slide JSON parse failed for "${assignmentName}" (attempt 1): ${err instanceof Error ? err.message : String(err)}`
        );
        continue;
      }
      return { error: `Could not parse slide data for "${assignmentName}".` };
    }
  }

  if (!parsed) {
    return { error: `Could not parse slide data for "${assignmentName}".` };
  }

  if (!parsed.slides || !Array.isArray(parsed.slides)) {
    return { error: `Model did not return a valid slides array for "${assignmentName}".` };
  }

  let slides: SlideData[] = parsed.slides
    .filter((s) => typeof s.title === "string" && Array.isArray(s.bullets))
    .map((s) => toSlideData(s, 4));

  slides = propagateExampleCodeToFollowups(slides);

  return {
    presentationTitle: parsed.presentationTitle ?? assignmentName,
    slides,
  };
}

export async function generateDeckFromTemplateAction(
  template: DeckTemplate,
  ctx: DeckGenContext,
  provider: LlmProvider
): Promise<GeneratedDeck | { error: string }> {
  try {
    await requireOwner();
    if (!template || !Array.isArray(template.slides) || template.slides.length === 0)
      return { error: "Add at least one slide to the template first." };
    return await generateDeckFromTemplate(template, ctx, provider);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate the deck." };
  }
}

const PRESENTATION_PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/** Render a generated deck to a real .pptx and store it in the Files library
 * (kind "file", tagged source "workflow"), so a workflow-generated presentation
 * appears in the Files menu in addition to its Drafts > Presentations draft.
 * Gradient themes fall back to a solid fill here (no browser canvas server-side);
 * the Drafts download renders the true gradient. */
export async function savePresentationFileAction(input: {
  presentationTitle: string;
  slides: PptxSlide[];
  theme?: DeckTheme | null;
  author?: string;
  workflowName?: string | null;
  workflowId?: string;
  workflowRunId?: string;
}): Promise<{ id: string } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    if (!Array.isArray(input.slides) || input.slides.length === 0) {
      return { error: "No slides to save." };
    }
    const theme: PptxTheme | undefined = input.theme
      ? {
          backgroundKind: input.theme.backgroundKind,
          backgroundColor: input.theme.backgroundColor,
          backgroundColor2: input.theme.backgroundColor2,
          fontColor: input.theme.fontColor,
        }
      : undefined;
    const title = (input.presentationTitle || "Presentation").trim() || "Presentation";
    const buf = await buildSlidesPptx({
      presentationTitle: title,
      slides: input.slides,
      author: input.author,
      theme,
    });
    const blob = new Blob([buf], { type: PRESENTATION_PPTX_MIME });
    const safeName = title.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120) || "Presentation";
    const file = await saveRecordingFile(supabase, user.id, blob, {
      name: `${safeName}.pptx`,
      kind: "file",
      mimeType: PRESENTATION_PPTX_MIME,
      durationSec: null,
      fileExt: "pptx",
      source: "workflow",
      origin: "unattended",
      workflowName: input.workflowName ?? null,
      workflowId: input.workflowId ?? null,
      workflowRunId: input.workflowRunId ?? null,
    });
    return { id: file.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the presentation file." };
  }
}

/** Save a generic file (docx, mp3, html, etc.) to the Files library via base64.
 * Mirrors savePresentationFileAction persistence: kind "file", source "workflow",
 * origin "unattended". Rejects base64 longer than 15MB. Returns file id on success
 * or error message. */
export async function saveLibraryFileAction(input: {
  name: string;
  base64: string;
  mimeType: string;
  fileExt: string;
  workflowId?: string;
  workflowName?: string;
  workflowRunId?: string;
}): Promise<{ id: string } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();

    if (input.base64.length > 15_000_000) {
      return { error: "The file is too large to save to the library." };
    }

    const buffer = Buffer.from(input.base64, 'base64');
    const blob = new Blob([buffer], { type: input.mimeType });
    const safeName = (input.name || "File").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120) || "File";
    const ext = (input.fileExt || "").toLowerCase().replace(/^\./, "");

    const file = await saveRecordingFile(supabase, user.id, blob, {
      name: ext ? `${safeName}.${ext}` : safeName,
      kind: "file",
      mimeType: input.mimeType,
      durationSec: null,
      fileExt: ext,
      source: "workflow",
      origin: "unattended",
      workflowName: input.workflowName ?? null,
      workflowId: input.workflowId ?? null,
      workflowRunId: input.workflowRunId ?? null,
    });
    return { id: file.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the file." };
  }
}

async function generateModuleIntroForAssignment(
  assignmentName: string,
  displayTitle: string,
  content: string,
  templateText = "",
  provider: LlmProvider = "gemini"
): Promise<{ text: string } | { error: string }> {
  // Embedded Deterministic Engine: template the module-intro document.
  if (provider === "embedded") {
    return { text: scaffoldModuleIntroDoc(displayTitle, content) };
  }

  const prompt = `You are an expert educator writing a module introduction document for a programming course.

ASSIGNMENT / MODULE: ${displayTitle}

ASSIGNMENT CONTENT:
${content}

Write a well-formatted module introduction for the week this assignment covers. The document should:
1. Start with a single document title on the very first line, written exactly as the markdown level-1 heading "# Module Introduction: ${displayTitle}". This must be the only level-1 heading in the document. Never use folder names, file paths, or identifiers like "review1" or "assignment3" as the title or any heading.
2. Open with an engaging overview of the topic and why it matters.
3. Include a section called "Real-World Applications" with at least 3 concrete, specific examples of how these concepts or technologies are used in real software, industry products, or everyday technology that students will recognise (e.g., how the concept powers a well-known app, framework, or system).
4. Include a brief section called "What You Will Learn" that lists the key skills and concepts students will gain.
5. Be written in clear, motivating language appropriate for undergraduate students.
6. Format every section heading (other than the document title) as a markdown level-2 heading (e.g. "## Real-World Applications"). Do not use any other markdown symbols (no bold, italics, or bullet asterisks) in the body text.

Do not include the assignment instructions or grading criteria — focus only on introducing the module topic.${buildStrictTemplateBlock(templateText)}`;

  const result = await callLlm(
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    },
    provider
  );

  if (!result.ok) {
    return { error: `LLM API error for module intro "${assignmentName}": HTTP ${result.status} — ${result.body.slice(0, 200)}` };
  }

  const text = result.text;

  if (!text.trim()) {
    return { error: `Module intro generation returned empty response for "${assignmentName}".` };
  }

  return { text: text.trim() };
}

async function generateAssignmentInstructionsForAssignment(
  assignmentName: string,
  displayTitle: string,
  readmeContent: string,
  templateText = "",
  provider: LlmProvider = "gemini"
): Promise<{ text: string } | { error: string }> {
  // Embedded Deterministic Engine: template the assignment instruction sheet.
  if (provider === "embedded") {
    return { text: scaffoldAssignmentDoc(displayTitle, readmeContent) };
  }

  const prompt = `You are an expert educator writing a formal assignment instruction sheet for a programming course.

ASSIGNMENT: ${displayTitle}

README / ASSIGNMENT SOURCE:
${readmeContent}

Using the README content above, write a complete, student-facing assignment instruction document. The document should:
1. Start with the document title on the very first line, written exactly as the markdown level-1 heading "# ${displayTitle}". This must be the only level-1 heading. Never use folder names, file paths, or identifiers like "review1" or "assignment3" as the title or any heading.
2. Include an "Assignment Overview" section that clearly states the purpose and learning objectives.
3. Include a "Instructions" section that details exactly what students must do, broken into bulleted steps or tasks pulled from the README (each step on its own line starting with "- ").
4. Include a "Requirements" section listing any technical or functional requirements mentioned in the README (e.g., methods to implement, expected behaviour, constraints).
5. Include a "Helpful Free Resources" section with at least 5 free external resources (tutorials, official documentation, guides, or reference material) that help students complete this assignment. For each resource, give the title, the URL, and one short sentence on why it helps. Every resource must be freely accessible (no paywalls) and come from a reputable source (e.g. official docs, MDN, Python docs, freeCodeCamp, Microsoft Learn, university or open course material).
6. End with a "Deliverables" section that describes what must be completed and submitted (e.g., files to implement, tests to pass).
7. Format every section heading (other than the document title) as a markdown level-2 heading (e.g. "## Instructions"). For any list, start each item on its own line with a hyphen ("- "); NEVER use numbered lists (no "1.", "2.", etc.). Do not use any other markdown symbols (no bold or italics) in the body text.
8. Write in clear, direct language appropriate for undergraduate students.

Do not invent requirements not present in the README. If the README is sparse, note that students should contact the instructor (for example during office hours) for clarification. Never tell students to use, post on, check, or refer to a course discussion board, forum, or message board anywhere in the document. The "Helpful Free Resources" section should always be included regardless of how sparse the README is. Do not include submission instructions - a standard submission section is appended automatically.${buildStrictTemplateBlock(templateText)}`;

  const result = await callLlm(
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
    },
    provider
  );

  if (!result.ok) {
    return { error: `LLM API error for assignment instructions "${assignmentName}": HTTP ${result.status} — ${result.body.slice(0, 200)}` };
  }

  const text = result.text;

  if (!text.trim()) {
    return { error: `Assignment instructions generation returned empty response for "${assignmentName}".` };
  }

  return { text: text.trim() };
}

export async function generateCourseRubricFromZipAction(
  zipBase64: string,
  provider: LlmProvider = "gemini"
): Promise<string | { error: string }> {
  const TEXT_EXTENSIONS = new Set([
    ".md", ".txt", ".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".cpp", ".c",
    ".h", ".cs", ".go", ".rs", ".rb", ".php", ".swift", ".kt", ".r", ".sql",
    ".sh", ".yaml", ".yml", ".json", ".html", ".css", ".scss",
  ]);

  const ASSIGNMENTS_PATTERN = /^(assignments?|homeworks?|hw|labs?|projects?|exercises?|problems?)$/i;
  const MAX_FILE_CHARS = 3000;

  try {
    const JSZip = (await import("jszip")).default;
    const buffer = Buffer.from(zipBase64, "base64");
    const zip = await JSZip.loadAsync(buffer);

    const allPaths = Object.keys(zip.files);

    const topFolders = new Set<string>();
    for (const path of allPaths) {
      const m = path.match(/^([^/]+)\//);
      if (m) topFolders.add(m[1]);
    }

    let assignmentsPrefix = "";
    for (const folder of topFolders) {
      if (ASSIGNMENTS_PATTERN.test(folder)) {
        assignmentsPrefix = folder + "/";
        break;
      }
    }

    if (!assignmentsPrefix) {
      for (const path of allPaths) {
        const m = path.match(/^[^/]+\/([^/]+)\//);
        if (m && ASSIGNMENTS_PATTERN.test(m[1])) {
          const firstSlash = path.indexOf("/");
          const secondSlash = path.indexOf("/", firstSlash + 1);
          if (firstSlash !== -1 && secondSlash !== -1) {
            assignmentsPrefix = path.slice(0, secondSlash + 1);
            break;
          }
        }
      }
    }

    if (!assignmentsPrefix) {
      return {
        error: "No assignments folder found in the uploaded zip. Expected a top-level folder named 'assignments', 'homework', 'labs', or similar.",
      };
    }

    const assignmentFolders = new Set<string>();
    for (const path of allPaths) {
      if (path.startsWith(assignmentsPrefix)) {
        const relative = path.slice(assignmentsPrefix.length);
        const parts = relative.split("/");
        if (parts.length >= 2 && parts[0]) {
          assignmentFolders.add(parts[0]);
        }
      }
    }

    if (assignmentFolders.size === 0) {
      return { error: "No assignment subfolders found inside the assignments folder." };
    }

    // Collect the README/instructions from every assignment
    const aggregatedInstructions: string[] = [];

    for (const folder of Array.from(assignmentFolders).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    )) {
      const folderPrefix = assignmentsPrefix + folder + "/";
      const folderFiles = allPaths.filter((p) => p.startsWith(folderPrefix) && !zip.files[p].dir);

      const mdFiles = folderFiles.filter((p) => p.toLowerCase().endsWith(".md"));
      const readmeFile =
        mdFiles.find((p) => p.slice(folderPrefix.length).toLowerCase().startsWith("readme")) ??
        mdFiles[0];

      if (readmeFile) {
        try {
          let content = await zip.files[readmeFile].async("string");
          if (content.length > MAX_FILE_CHARS) {
            content = content.slice(0, MAX_FILE_CHARS) + "\n… (truncated)";
          }
          if (content.trim()) {
            aggregatedInstructions.push(`=== ${folder} ===\n${content.trim()}`);
          }
        } catch {
          // skip unreadable file
        }
      } else {
        // Fall back to any text file in the folder
        const textFiles = folderFiles.filter((p) => {
          const ext = p.includes(".") ? "." + p.split(".").pop()!.toLowerCase() : "";
          return TEXT_EXTENSIONS.has(ext);
        });
        for (const filePath of textFiles.slice(0, 2)) {
          try {
            let content = await zip.files[filePath].async("string");
            if (content.length > MAX_FILE_CHARS) {
              content = content.slice(0, MAX_FILE_CHARS) + "\n… (truncated)";
            }
            if (content.trim()) {
              aggregatedInstructions.push(`=== ${folder} ===\n${content.trim()}`);
              break;
            }
          } catch {
            // skip
          }
        }
      }
    }

    if (aggregatedInstructions.length === 0) {
      return { error: "No readable assignment instructions found in the uploaded zip." };
    }

    const aggregatedText = aggregatedInstructions.join("\n\n");
    return await generateRubric(aggregatedText, provider);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/**
 * Generate a course rubric from course description and schedule (used when
 * no repository is available). Returns the rubric text or an error.
 */
export async function generateCourseRubricFromScheduleAction(
  courseDescription: string,
  scheduleJson: string,
  provider: LlmProvider = "gemini"
): Promise<string | { error: string }> {
  try {
    await requireOwner();

    const { buildRubricSourceFromSchedule } = await import("@/app/utils/rubric");

    let schedule: ScheduleWeekPlan[] = [];
    try {
      const parsed = JSON.parse(scheduleJson);
      if (Array.isArray(parsed)) {
        schedule = parsed;
      }
    } catch {
      // Tolerate invalid/empty JSON by treating it as no schedule
    }

    const sourceText = buildRubricSourceFromSchedule(courseDescription, schedule);

    if (!sourceText.trim()) {
      return { error: "No course description or schedule provided to generate the rubric from." };
    }

    return await generateRubric(sourceText, provider);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/**
 * Revise one already-generated lecture-plan document (module intro or assignment
 * instructions) from a freeform instruction, preserving its structure/headings.
 * Used by the document editor's "Revise with AI" before download.
 */
export async function reviseLecturePlanTextAction(
  section: "intro" | "instructions",
  assignmentName: string,
  currentText: string,
  instruction: string,
  templateText = "",
  provider: LlmProvider = "gemini"
): Promise<{ text: string } | { error: string }> {
  try {
    await requireOwner();
    if (!instruction.trim()) return { error: "Describe the change you want first." };
    if (!currentText.trim()) return { error: "There is no document to revise yet." };

    // Embedded Deterministic Engine: apply concrete edit commands (replace,
    // remove/add sections and bullets, retitle, shorten) by rule; an instruction
    // the engine cannot parse leaves the document unchanged.
    if (provider === "embedded") {
      return { text: applyTextRevision(currentText, instruction).text };
    }

    const docKind = section === "intro" ? "module introduction" : "assignment instruction sheet";
    const prompt = `You are an expert educator revising a ${docKind} for a programming course.

ASSIGNMENT / MODULE: ${assignmentName}

CURRENT DOCUMENT:
${currentText}

REVISION INSTRUCTION:
${instruction}

Rewrite the document applying the instruction. Requirements:
- Preserve the overall structure: keep the single level-1 title (one "# " line) and the level-2 "## " section headings.
- For any list, start each item on its own line with a hyphen ("- "); NEVER use numbered lists (no "1.", "2.", etc.). Do not use any other markdown (no bold or italics) in body text.
- Leave content the instruction does not touch intact.
- Never tell students to use, post on, check, or refer to a course discussion board, forum, or message board.
- Output ONLY the revised document text, with no preamble or explanation.${buildStrictTemplateBlock(templateText)}`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 2048 },
      },
      provider
    );
    if (!result.ok) {
      return { error: `Revision failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }
    const text = result.text.trim();
    if (!text) return { error: "The model returned an empty document." };
    return { text };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/** Revise a lecture deck's slides from a freeform instruction (editor: "Revise slides"). */
export async function reviseLectureSlidesAction(
  presentationTitle: string,
  currentSlides: SlideData[],
  instruction: string,
  provider: LlmProvider = "gemini"
): Promise<{ slides: SlideData[] } | { error: string }> {
  try {
    await requireOwner();
    if (!instruction.trim()) return { error: "Describe the change you want first." };

    // Embedded Deterministic Engine: apply concrete edit commands (remove/add/
    // rename slides, remove bullets, replace, shorten) by rule; an instruction
    // the engine cannot parse leaves the deck unchanged.
    if (provider === "embedded") {
      return { slides: applySlidesRevision(currentSlides, instruction).slides };
    }

    const prompt = `You are an expert educator revising a lecture slide deck titled "${presentationTitle}".

CURRENT SLIDES (JSON):
${JSON.stringify(currentSlides, null, 2)}

REVISION INSTRUCTION:
${instruction}

Apply the instruction and return ONLY valid JSON of this shape:
{ "slides": [ { "title": "...", "bullets": ["...", "..."], "code": "...", "codeLanguage": "python" } ] }

Requirements:
- Maximum 3 bullets per slide; each bullet a single concise idea.
- Preserve slides the instruction does not affect; modify, add, or remove slides as needed.
- Keep "code"/"codeLanguage" only on coding Example/Walkthrough/Practice/Answer slides.
- Do not include any text outside the JSON object.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 4096 },
      },
      provider
    );
    if (!result.ok) {
      return { error: `Revision failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const jsonText = jsonObjectSlice(result.text);
    if (!jsonText) {
      return { error: "Could not parse slides from the model response." };
    }
    const parsed = JSON.parse(jsonText) as {
      slides?: Array<{ title?: string; bullets?: string[]; code?: string; codeLanguage?: string }>;
    };
    if (!parsed.slides || !Array.isArray(parsed.slides)) {
      return { error: "Model did not return a valid slides array." };
    }
    let slides: SlideData[] = parsed.slides
      .filter((s) => typeof s.title === "string" && Array.isArray(s.bullets))
      .map((s) => toSlideData(s, 3));
    slides = propagateExampleCodeToFollowups(slides);
    return { slides };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/**
 * Map over `items` running at most `limit` tasks concurrently, preserving order.
 * The lecture-plan generator makes three LLM calls per assignment; without a cap
 * a large course fires dozens of Gemini requests at once and trips the per-minute
 * rate limit, which (before retries existed) silently dropped whole assignments.
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    for (let current = next++; current < items.length; current = next++) {
      results[current] = await fn(items[current], current);
    }
  });
  await Promise.all(workers);
  return results;
}

// ── Shared course-zip parsing ────────────────────────────────────────────────
// The zip-based course tools (rubric, "generate all" plans, "generate one"
// module) all locate an assignments folder, enumerate its subfolders, and pull
// each one's lecture-relevant text the same way. These helpers are the single
// source of truth so every path reads a codebase zip identically.

const ASSIGNMENTS_FOLDER_PATTERN =
  /^(assignments?|homeworks?|hw|labs?|projects?|exercises?|problems?)$/i;

const COURSE_TEXT_EXTENSIONS = new Set([
  ".md", ".txt", ".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".cpp", ".c",
  ".h", ".cs", ".go", ".rs", ".rb", ".php", ".swift", ".kt", ".r", ".sql",
  ".sh", ".yaml", ".yml", ".json", ".html", ".css", ".scss",
]);

const ASSIGNMENT_MAX_FILE_CHARS = 3000;
const ASSIGNMENT_MAX_TOTAL_CHARS = 12000;

interface AssignmentContentBundle {
  name: string;
  content: string;
  readmeContent: string;
}

interface LectureTemplates {
  introTemplateText: string;
  instructionsTemplateText: string;
  introTemplateHeadings: string[];
  instructionsTemplateHeadings: string[];
}

/**
 * Locate the assignments folder in a course zip: a top-level folder matching
 * ASSIGNMENTS_FOLDER_PATTERN, or one level deep when the zip wraps the repo in a
 * root folder. Returns the prefix (with trailing slash) or "" when none exists.
 */
function findAssignmentsPrefix(allPaths: string[]): string {
  const topFolders = new Set<string>();
  for (const path of allPaths) {
    const m = path.match(/^([^/]+)\//);
    if (m) topFolders.add(m[1]);
  }
  for (const folder of topFolders) {
    if (ASSIGNMENTS_FOLDER_PATTERN.test(folder)) return folder + "/";
  }
  // Try one level deep (zip may wrap the repo in a root folder).
  for (const path of allPaths) {
    const m = path.match(/^[^/]+\/([^/]+)\//);
    if (m && ASSIGNMENTS_FOLDER_PATTERN.test(m[1])) {
      const firstSlash = path.indexOf("/");
      const secondSlash = path.indexOf("/", firstSlash + 1);
      if (firstSlash !== -1 && secondSlash !== -1) {
        return path.slice(0, secondSlash + 1);
      }
    }
  }
  return "";
}

/**
 * List the assignment subfolder slugs under `prefix`, sorted numerically so
 * "assignment2" precedes "assignment10".
 */
function listAssignmentFolders(allPaths: string[], prefix: string): string[] {
  const folders = new Set<string>();
  for (const path of allPaths) {
    if (path.startsWith(prefix)) {
      const parts = path.slice(prefix.length).split("/");
      if (parts.length >= 2 && parts[0]) folders.add(parts[0]);
    }
  }
  return Array.from(folders).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
}

/**
 * Pull the lecture-relevant text (instructions, then tests, then other source)
 * for a single assignment folder, truncated to stay within the model's context
 * window. Returns null when the folder holds no readable text.
 */
async function extractAssignmentContentBundle(
  zip: JSZip,
  allPaths: string[],
  prefix: string,
  folder: string
): Promise<AssignmentContentBundle | null> {
  const folderPrefix = prefix + folder + "/";
  const folderFiles = allPaths.filter((p) => p.startsWith(folderPrefix) && !zip.files[p].dir);

  const mdFiles = folderFiles.filter((p) => p.toLowerCase().endsWith(".md"));
  const testFiles = folderFiles.filter((p) => {
    const name = p.toLowerCase();
    return (name.includes("test") || name.includes("spec")) && !p.toLowerCase().endsWith(".md");
  });
  const otherFiles = folderFiles.filter((p) => {
    const ext = p.includes(".") ? "." + p.split(".").pop()!.toLowerCase() : "";
    const name = p.toLowerCase();
    return (
      COURSE_TEXT_EXTENSIONS.has(ext) &&
      !p.toLowerCase().endsWith(".md") &&
      !name.includes("test") &&
      !name.includes("spec")
    );
  });

  const orderedFiles = [...mdFiles, ...testFiles, ...otherFiles];
  let content = "";
  let totalChars = 0;

  for (const filePath of orderedFiles) {
    if (totalChars >= ASSIGNMENT_MAX_TOTAL_CHARS) break;
    const ext = filePath.includes(".") ? "." + filePath.split(".").pop()!.toLowerCase() : "";
    if (!COURSE_TEXT_EXTENSIONS.has(ext)) continue;

    try {
      let fileContent = await zip.files[filePath].async("string");
      const fileName = filePath.slice(folderPrefix.length);
      if (fileContent.length > ASSIGNMENT_MAX_FILE_CHARS) {
        fileContent = fileContent.slice(0, ASSIGNMENT_MAX_FILE_CHARS) + "\n… (truncated)";
      }
      content += `\n\n=== ${fileName} ===\n${fileContent}`;
      totalChars += fileContent.length;
    } catch {
      // skip unreadable / binary files
    }
  }

  if (!content.trim()) return null;

  // Extract README content specifically for assignment instructions.
  const readmeFile =
    mdFiles.find((p) => p.slice(folderPrefix.length).toLowerCase().startsWith("readme")) ??
    mdFiles[0];
  let readmeContent = "";
  if (readmeFile) {
    try {
      readmeContent = await zip.files[readmeFile].async("string");
      if (readmeContent.length > ASSIGNMENT_MAX_FILE_CHARS) {
        readmeContent = readmeContent.slice(0, ASSIGNMENT_MAX_FILE_CHARS) + "\n… (truncated)";
      }
    } catch {
      // fall back to full content
    }
  }

  return { name: folder, content, readmeContent: readmeContent || content };
}

/** Extract the strict-template text + heading lines once, for reuse per assignment. */
async function extractLectureTemplates(
  introTemplateBase64?: string,
  instructionsTemplateBase64?: string
): Promise<LectureTemplates> {
  return {
    introTemplateText: introTemplateBase64 ? await extractDocxTemplateText(introTemplateBase64) : "",
    instructionsTemplateText: instructionsTemplateBase64
      ? await extractDocxTemplateText(instructionsTemplateBase64)
      : "",
    // The template's real heading lines, so the downloaded document only applies
    // heading formatting where the template itself has a heading.
    introTemplateHeadings: introTemplateBase64 ? await extractDocxTemplateHeadings(introTemplateBase64) : [],
    instructionsTemplateHeadings: instructionsTemplateBase64
      ? await extractDocxTemplateHeadings(instructionsTemplateBase64)
      : [],
  };
}

/**
 * Generate the full module (slides + module intro + assignment instructions) for
 * one assignment from its extracted content. Shared by the "generate all" and
 * "generate one" paths so output format and failure handling stay identical.
 */
async function buildAssignmentPlan(
  bundle: AssignmentContentBundle,
  index: number,
  lectureDurationMinutes: number,
  templates: LectureTemplates,
  provider: LlmProvider
): Promise<AssignmentPlan> {
  const { name, content, readmeContent } = bundle;

  // Map the folder slug to a clean human title/label. Strip a machine-slug
  // prefix from the source H1 (e.g. "# review1: Review: Fundamentals" ->
  // "Review: Fundamentals"); fall back to a humanized folder label. Clean the
  // README the model sees so it can't echo the slug back as the title.
  const sourceH1 = readmeContent.match(/^[ \t]*#[ \t]+(.+)$/m)?.[1]?.trim() ?? "";
  const label = humanizeAssignmentName(name);
  const strippedH1 = stripAssignmentSlugPrefix(sourceH1, name);
  const displayTitle = strippedH1 && !looksLikeAssignmentSlug(strippedH1) ? strippedH1 : label;
  const cleanedReadme = sourceH1
    ? readmeContent.replace(/^[ \t]*#[ \t]+.+$/m, `# ${displayTitle}`)
    : readmeContent;

  const [slidesResult, introResult, instructionsResult] = await Promise.all([
    generateSlidesForAssignment(name, content, lectureDurationMinutes, provider),
    generateModuleIntroForAssignment(name, displayTitle, content, templates.introTemplateText, provider),
    generateAssignmentInstructionsForAssignment(name, displayTitle, cleanedReadme, templates.instructionsTemplateText, provider),
  ]);

  // Never drop the whole assignment when only the slide deck fails — that
  // silently removed an assignment from the output with no feedback. Keep the
  // assignment (its intro/instructions are usually fine) with an empty deck so
  // it stays visible and can be regenerated.
  const slidesFailed = "error" in slidesResult;
  if (slidesFailed) {
    console.error(`Slide generation failed for "${name}": ${slidesResult.error}`);
  }
  const slides = slidesFailed ? [] : slidesResult.slides;

  // Derive the week number from the assignment folder name (e.g. "week3",
  // "Week 3", "assignment-03"). Fall back to the supplied position. Only used
  // for ordering now — file names use the unique label.
  const parsedWeek = name.match(/\d+/)?.[0];
  const weekNumber = parsedWeek ? parseInt(parsedWeek, 10) : index + 1;

  // Append submission guidance to instructions, guarded against double-appending
  let finalInstructions = "error" in instructionsResult ? "" : instructionsResult.text;
  if (finalInstructions.trim() && !finalInstructions.includes("Submitting your work")) {
    finalInstructions += REPO_SUBMISSION_GUIDANCE;
  }

  return {
    assignmentName: name,
    slides,
    slidesFailed,
    // Use the clean human title for the deck.
    presentationTitle: displayTitle,
    label,
    moduleIntroduction: "error" in introResult ? "" : introResult.text,
    assignmentInstructions: finalInstructions,
    weekNumber,
    introTemplateHeadings: templates.introTemplateHeadings,
    instructionsTemplateHeadings: templates.instructionsTemplateHeadings,
  } satisfies AssignmentPlan;
}

export async function generateLecturePlansAction(
  zipBase64: string,
  lectureDurationMinutes: number,
  introTemplateBase64?: string,
  instructionsTemplateBase64?: string,
  provider: LlmProvider = "gemini"
): Promise<AssignmentPlan[] | { error: string }> {
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(Buffer.from(zipBase64, "base64"));
    const allPaths = Object.keys(zip.files);

    const prefix = findAssignmentsPrefix(allPaths);
    if (!prefix) {
      return {
        error:
          "No assignments folder found in the uploaded zip. Expected a top-level folder named 'assignments', 'homework', 'labs', or similar.",
      };
    }

    const folders = listAssignmentFolders(allPaths, prefix);
    if (folders.length === 0) {
      return { error: "No assignment subfolders found inside the assignments folder." };
    }

    const bundles: AssignmentContentBundle[] = [];
    for (const folder of folders) {
      const bundle = await extractAssignmentContentBundle(zip, allPaths, prefix, folder);
      if (bundle) bundles.push(bundle);
    }

    if (bundles.length === 0) {
      return { error: "No readable text content found in the assignment folders." };
    }

    const templates = await extractLectureTemplates(introTemplateBase64, instructionsTemplateBase64);

    // Generate each assignment's module, bounding how many run at once (each
    // makes three LLM calls) to stay under the provider's rate limit; the
    // transport layer additionally retries transient failures.
    const LECTURE_PLAN_CONCURRENCY = 4;
    const plans = await mapWithConcurrency(bundles, LECTURE_PLAN_CONCURRENCY, (bundle, index) =>
      buildAssignmentPlan(bundle, index, lectureDurationMinutes, templates, provider)
    );

    if (plans.length === 0) {
      return { error: "No assignments could be generated from the uploaded zip." };
    }

    // Normalize week numbers to match the course schedule: file/module numbering
    // downstream is 1-based and schedule-aligned, so zero-based folder sets are
    // shifted up by one. renumberWeekLabel only rewrites a "week NN" token that
    // is exactly one behind, so already-correct labels pass through unchanged.
    const weekMap = assignWeekNumbers(folders);
    for (const plan of plans) {
      const week = weekMap.get(plan.assignmentName);
      if (week !== undefined) {
        plan.label = renumberWeekLabel(plan.label, week);
        plan.presentationTitle = renumberWeekLabel(plan.presentationTitle, week);
        plan.weekNumber = week;
      }
    }

    return plans;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/**
 * List the assignment folders in a course zip (slug + human label) so the UI can
 * offer a picker for single-module generation.
 */
export async function listAssignmentFoldersAction(
  zipBase64: string
): Promise<{ folders: { slug: string; label: string }[] } | { error: string }> {
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(Buffer.from(zipBase64, "base64"));
    const allPaths = Object.keys(zip.files);

    const prefix = findAssignmentsPrefix(allPaths);
    if (!prefix) {
      return {
        error:
          "No assignments folder found in the uploaded zip. Expected a top-level folder named 'assignments', 'homework', 'labs', or similar.",
      };
    }

    const folders = listAssignmentFolders(allPaths, prefix);
    if (folders.length === 0) {
      return { error: "No assignment subfolders found inside the assignments folder." };
    }

    const weekMap = assignWeekNumbers(folders);
    return {
      folders: folders.map((slug) => {
        const week = weekMap.get(slug);
        const base = humanizeAssignmentName(slug);
        return { slug, label: week === undefined ? base : renumberWeekLabel(base, week) };
      }),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/**
 * Generate the full module (slides + intro + instructions) for ONE assignment
 * folder in the zip, identified by its slug (from listAssignmentFoldersAction).
 * Runs the same per-assignment generation as generateLecturePlansAction.
 */
export async function generateLecturePlanForAssignmentAction(
  zipBase64: string,
  slug: string,
  lectureDurationMinutes: number,
  introTemplateBase64?: string,
  instructionsTemplateBase64?: string,
  provider: LlmProvider = "gemini"
): Promise<AssignmentPlan | { error: string }> {
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(Buffer.from(zipBase64, "base64"));
    const allPaths = Object.keys(zip.files);

    const prefix = findAssignmentsPrefix(allPaths);
    if (!prefix) {
      return {
        error:
          "No assignments folder found in the uploaded zip. Expected a top-level folder named 'assignments', 'homework', 'labs', or similar.",
      };
    }

    const folders = listAssignmentFolders(allPaths, prefix);
    const index = folders.indexOf(slug);
    if (index === -1) {
      return { error: `Assignment "${slug}" was not found in the uploaded zip.` };
    }

    const bundle = await extractAssignmentContentBundle(zip, allPaths, prefix, slug);
    if (!bundle) {
      return { error: `No readable text content found in the "${slug}" folder.` };
    }

    const templates = await extractLectureTemplates(introTemplateBase64, instructionsTemplateBase64);

    // Preserve the assignment's natural ordering (its position in the sorted
    // folder list) so a single module sorts correctly if merged into a list.
    const plan = await buildAssignmentPlan(bundle, index, lectureDurationMinutes, templates, provider);

    // Normalize week numbers to match the course schedule, same as generateLecturePlansAction.
    const weekMap = assignWeekNumbers(folders);
    const week = weekMap.get(slug);
    if (week !== undefined) {
      plan.label = renumberWeekLabel(plan.label, week);
      plan.presentationTitle = renumberWeekLabel(plan.presentationTitle, week);
      plan.weekNumber = week;
    }

    return plan;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

// ── Course Engine binary endpoints ──────────────────────────────────────────
// These wrap the Course Engine API's file-returning endpoints. They are invoked
// only when the provider toggle is set to "other"; the result is a base64 file
// the client downloads directly (no in-app editable preview).

export async function generateLectureDeckAction(
  objectives: string,
  title?: string,
  file?: CourseEngineUploadFile,
  homework?: CourseEngineHomework
): Promise<CourseEngineFile | { error: string }> {
  try {
    return await courseEngineLecture(objectives, title, file, homework);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Lecture generation failed." };
  }
}

export async function generateCourseMaterialsAction(
  zipBase64: string
): Promise<(CourseEngineFile & { rubricCsv: string | null }) | { error: string }> {
  try {
    const materials = await courseEngineMaterials(zipBase64);

    // The materials package already contains the deterministic rubric.csv, so
    // pull it out here and hand it back with the file — that lets the UI show
    // the rubric from this single call instead of re-hitting /materials.
    let rubricCsv: string | null = null;
    try {
      const JSZip = (await import("jszip")).default;
      const out = await JSZip.loadAsync(Buffer.from(materials.base64, "base64"));
      const rubricFile =
        out.file("rubric.csv") ??
        out.file(Object.keys(out.files).find((p) => /(^|\/)rubric\.csv$/i.test(p)) ?? "");
      if (rubricFile) {
        const csv = (await rubricFile.async("string")).trim();
        rubricCsv = csv || null;
      }
    } catch {
      // Rubric extraction is best-effort; the package download still succeeds.
    }

    return { ...materials, rubricCsv };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Materials generation failed." };
  }
}

// ── GitHub integration ────────────────────────────────────────────────────────

/** Whether a GitHub token is configured, so the UI can show/hide GitHub features. */
export async function githubConfiguredAction(): Promise<{ configured: boolean }> {
  return { configured: githubConfigured() };
}

/** List the repos the configured token can see (for repo pickers). */
export async function listGithubReposAction(): Promise<{ repos: GithubRepo[] } | { error: string }> {
  try {
    await requireOwner();
    return { repos: await listRepos() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list GitHub repositories." };
  }
}

/** Result of generating one student's repo from a template. */
export interface StudentRepoResult {
  student: string;
  name: string;
  htmlUrl?: string;
  error?: string;
}

/** One row's outcome when inviting students to their own repos. */
export interface StudentInviteResult {
  repo: string;
  username: string;
  error?: string;
}

const repoSlug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * Permanently delete repositories from an org, one result per repo so the UI
 * can show partial failures (e.g. missing delete_repo scope or protection).
 */
export async function deleteOrgReposAction(
  org: string,
  names: string[]
): Promise<{ results: Array<{ name: string; error?: string }> } | { error: string }> {
  try {
    await requireOwner();
    if (!org.trim()) return { error: "Choose an organization." };
    const list = names.map((n) => n.trim()).filter(Boolean);
    if (list.length === 0) return { error: "Choose at least one repository." };
    const results: Array<{ name: string; error?: string }> = [];
    for (const name of list) {
      try {
        await deleteRepo(org.trim(), name);
        results.push({ name });
      } catch (err) {
        results.push({ name, error: err instanceof Error ? err.message : "Failed" });
      }
    }
    return { results };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete repositories." };
  }
}

/**
 * Generate one repo per student in `org` from a template repo (may live under any owner the token can access).
 * Each repo is named `<prefix>-<student>` (prefix optional). Returns a per-student
 * result so the UI can show successes and failures (e.g. a name that already exists).
 * templateRepo may be a bare repo name ("my-template", lives in org) or a full name ("owner/my-template").
 */
export async function generateStudentReposAction(
  org: string,
  templateRepo: string,
  prefix: string,
  students: string[],
  isPrivate: boolean
): Promise<{ results: StudentRepoResult[] } | { error: string }> {
  try {
    await requireOwner();
    if (!org.trim()) return { error: "Choose an organization." };
    if (!templateRepo.trim()) return { error: "Choose a template repository." };
    const list = students.map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) return { error: "Add at least one student." };
    const base = prefix.trim() ? repoSlug(prefix) : "";
    const t = templateRepo.trim();
    const [templateOwner, templateName] = t.includes("/") ? [t.split("/")[0], t.split("/").slice(1).join("/")] : [org.trim(), t];
    const results: StudentRepoResult[] = [];
    for (const student of list) {
      const suffix = repoSlug(student) || "student";
      const name = (base ? `${base}-${suffix}` : suffix).slice(0, 95);
      try {
        const repo = await generateFromTemplate(templateOwner, templateName, org.trim(), name, isPrivate);
        results.push({ student, name, htmlUrl: repo.htmlUrl });
      } catch (err) {
        results.push({ student, name, error: err instanceof Error ? err.message : "Failed" });
      }
    }
    return { results };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate the repositories." };
  }
}

/**
 * Invite students as OUTSIDE COLLABORATORS on their own generated repos - they
 * are never added to the org, so they can only see the repo they are invited
 * to. Each line is "github-username" (repo derived from the username) or
 * "student, github-username" (repo derived from the student text, matching
 * how the repos were generated).
 */
export async function inviteStudentCollaboratorsAction(
  org: string,
  prefix: string,
  lines: string[],
  permission: RepoPermission
): Promise<{ results: StudentInviteResult[] } | { error: string }> {
  try {
    await requireOwner();
    if (!org.trim()) return { error: "Choose an organization." };
    const rows = lines.map((l) => l.trim()).filter(Boolean);
    if (rows.length === 0) return { error: "Add at least one student line." };
    const base = prefix.trim() ? repoSlug(prefix) : "";
    const results: StudentInviteResult[] = [];
    for (const row of rows) {
      const idx = row.lastIndexOf(",");
      const left = idx === -1 ? row : row.slice(0, idx).trim();
      const right = idx === -1 ? "" : row.slice(idx + 1).trim();
      const username = (right || left).replace(/^@/, "");
      const suffix = repoSlug(right ? left : username) || "student";
      const repo = (base ? `${base}-${suffix}` : suffix).slice(0, 95);
      if (!username) {
        results.push({ repo, username: "", error: "Missing username" });
        continue;
      }
      try {
        await setRepoCollaborator(org.trim(), repo, username, permission);
        results.push({ repo, username });
      } catch (err) {
        results.push({ repo, username, error: err instanceof Error ? err.message : "Failed" });
      }
    }
    return { results };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not send the invitations." };
  }
}

/** Outcome of one student's classroom setup (repo creation + invite). */
export interface ClassroomRowResult {
  repo: string;
  created: "created" | "existed" | "failed";
  createError?: string;
  invited: boolean;
  inviteError?: string;
}

/**
 * Set up ONE student: create their repo from the template (an existing repo
 * with the same name counts as success, so re-runs are safe) and, when a
 * GitHub username is given, invite them to that repo as an outside
 * collaborator (never an org member).
 */
export async function setupStudentRepoAction(
  org: string,
  templateRepo: string,
  prefix: string,
  student: string,
  username: string,
  isPrivate: boolean,
  permission: RepoPermission
): Promise<ClassroomRowResult | { error: string }> {
  try {
    await requireOwner();
    if (!org.trim()) return { error: "Choose an organization." };
    if (!templateRepo.trim()) return { error: "Choose a template repository." };
    if (!student.trim() && !username.trim()) return { error: "Empty row." };
    const t = templateRepo.trim();
    const [templateOwner, templateName] = t.includes("/") ? [t.split("/")[0], t.split("/").slice(1).join("/")] : [org.trim(), t];
    const base = prefix.trim() ? repoSlug(prefix) : "";
    const suffix = repoSlug(student.trim() || username.trim()) || "student";
    const repo = (base ? `${base}-${suffix}` : suffix).slice(0, 95);
    let created: ClassroomRowResult["created"] = "created";
    let createError: string | undefined;
    try {
      await generateFromTemplate(templateOwner, templateName, org.trim(), repo, isPrivate);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      if (/already exists/i.test(msg)) {
        created = "existed";
      } else {
        created = "failed";
        createError = msg;
      }
    }
    let invited = false;
    let inviteError: string | undefined;
    const user = username.trim().replace(/^@/, "");
    if (user && created !== "failed") {
      try {
        await setRepoCollaborator(org.trim(), repo, user, permission);
        invited = true;
      } catch (err) {
        inviteError = err instanceof Error ? err.message : "Invite failed";
      }
    }
    return { repo, created, createError, invited, inviteError };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Setup failed." };
  }
}

/** List the orgs the token owns, for the "Import from org" dropdown. */
export async function listMyOrgsAction(): Promise<{ orgs: string[] } | { error: string }> {
  try {
    await requireOwner();
    return { orgs: await listOwnedOrgs() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list organizations." };
  }
}

/** List an org's repos (optionally filtered by name prefix) for bulk import. */
export async function listOrgReposAction(
  org: string,
  prefix?: string
): Promise<{ repos: GithubRepo[] } | { error: string }> {
  try {
    await requireOwner();
    if (!org.trim()) return { error: "Choose an organization." };
    return { repos: await listOrgRepos(org.trim(), prefix?.trim() || undefined) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list the organization's repositories." };
  }
}

/** List a repo's branches (default first) for the branch picker. */
export async function listGithubBranchesAction(
  repoRef: string
): Promise<{ branches: string[]; defaultBranch: string } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    return await listBranches(parsed.owner, parsed.repo);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list branches." };
  }
}

/** Build a bounded text digest of a repo (README + source) for course/rubric generation. */
export async function ingestRepoAction(repoRef: string, branch?: string): Promise<{ digest: RepoDigest } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    return { digest: await ingestRepo(parsed.owner, parsed.repo, {}, branch) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read the repository." };
  }
}

/** Create a new personal repo (auto-initialized). */
export async function createRepoAction(
  name: string,
  description: string,
  isPrivate: boolean,
  isTemplate: boolean
): Promise<{ repo: GithubRepo } | { error: string }> {
  try {
    await requireOwner();
    const clean = name.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
    if (!clean) return { error: "Enter a repository name." };
    return {
      repo: await createRepo(clean, {
        description: description.trim(),
        private: isPrivate,
        autoInit: true,
        isTemplate,
      }),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the repository." };
  }
}

/**
 * Create a new repo from an existing one used as a template. GitHub only allows
 * generating from a repo whose is_template flag is set, so when `markTemplate`
 * is true the source is flagged as a template first (the caller warns the user).
 * The new repo is created under the same owner/org as the template.
 */
export async function createRepoFromTemplateAction(
  templateRepoRef: string,
  name: string,
  isPrivate: boolean,
  markTemplate: boolean
): Promise<{ repo: { fullName: string; htmlUrl: string } } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(templateRepoRef);
    if (!parsed) return { error: "Choose a source repository as owner/name." };
    const clean = name.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
    if (!clean) return { error: "Enter a name for the new repository." };
    if (markTemplate) {
      await updateRepo(parsed.owner, parsed.repo, { isTemplate: true });
    }
    const repo = await generateFromTemplate(parsed.owner, parsed.repo, parsed.owner, clean, isPrivate);
    return { repo: { fullName: repo.fullName, htmlUrl: repo.htmlUrl } };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the repository from the template." };
  }
}

/**
 * Create a new GitHub repo seeded with a generated Copilot prompt, then kick off
 * GitHub's Copilot coding agent to build it: the prompt is written to
 * .github/copilot-instructions.md and PROMPT.md, and an issue containing the
 * prompt is opened and assigned to Copilot (which works and opens a PR). If the
 * Copilot coding agent is not available for the account/org, the repo is still
 * created and a note explains why Copilot did not start.
 */
export async function createCopilotRepoAction(
  name: string,
  prompt: string,
  isPrivate = true,
  org?: string,
  isTemplate = false,
  description?: string
): Promise<{ fullName: string; htmlUrl: string; issueUrl?: string; copilotNote?: string } | { error: string }> {
  try {
    await requireOwner();
    const clean = name.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
    if (!clean) return { error: "Enter a repository name." };
    if (!prompt.trim()) return { error: "Generate the Copilot prompt first." };
    const opts = {
      description: description?.trim() || "Project scaffold generated from a Copilot prompt.",
      private: isPrivate,
      autoInit: true,
      isTemplate,
    };
    const repo = org?.trim() ? await createOrgRepo(org.trim(), clean, opts) : await createRepo(clean, opts);
    await putFile(repo.owner, repo.name, ".github/copilot-instructions.md", prompt, "Add Copilot project instructions", repo.defaultBranch);
    await putFile(
      repo.owner,
      repo.name,
      "PROMPT.md",
      `# Build prompt\n\nOpen this repository in GitHub Copilot (Agent mode) to scaffold the project. The full instructions are in \`.github/copilot-instructions.md\`.\n\n---\n\n${prompt}\n`,
      "Add build prompt",
      repo.defaultBranch
    );
    // The repo is created and seeded. Kick off the Copilot coding agent to build
    // it (open an issue with the prompt and assign Copilot). Repo creation has
    // already succeeded, so a Copilot failure is surfaced as a note rather than
    // failing the whole action.
    let issueUrl: string | undefined;
    let copilotNote: string | undefined;
    try {
      const build = await startCopilotBuild(repo.owner, repo.name, prompt);
      issueUrl = build.issueUrl;
    } catch (copilotErr) {
      copilotNote =
        copilotErr instanceof Error ? copilotErr.message : "Could not start the Copilot coding agent.";
    }
    return { fullName: repo.fullName, htmlUrl: repo.htmlUrl, issueUrl, copilotNote };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the repository." };
  }
}

/** Create a Copilot coding-agent task (an issue assigned to Copilot) on a repo. */
export async function createCopilotTaskAction(
  repoRef: string,
  title: string,
  body: string
): Promise<{ issueUrl: string; issueNumber: number } | { error: string }> {
  try {
    await requireOwner();
    if (!title.trim()) return { error: "Enter a task title." };
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    return await createCopilotAgentTask(parsed.owner, parsed.repo, title.trim(), body.trim());
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the Copilot task." };
  }
}

/** List the Copilot coding-agent tasks (issues assigned to Copilot) on a repo. */
export async function listCopilotTasksAction(
  repoRef: string
): Promise<{ tasks: CopilotTask[] } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    return { tasks: await listCopilotTasks(parsed.owner, parsed.repo) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list Copilot tasks." };
  }
}

/** Bulk delete files/folders (a folder deletes everything under it) in one commit. */
export async function bulkDeletePathsAction(
  repoRef: string,
  branch: string,
  paths: string[],
  message?: string
): Promise<{ deleted: number } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    if (!branch.trim()) return { error: "Pick a branch." };
    if (!paths || paths.length === 0) return { error: "Select at least one file or folder." };
    return await deletePaths(parsed.owner, parsed.repo, branch.trim(), paths, message?.trim() || `Delete ${paths.length} item(s)`);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the selected items." };
  }
}

/** Bulk move files/folders into a destination folder (blank = repo root) in one commit. */
export async function bulkMovePathsAction(
  repoRef: string,
  branch: string,
  paths: string[],
  destination: string,
  message?: string
): Promise<{ moved: number } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    if (!branch.trim()) return { error: "Pick a branch." };
    if (!paths || paths.length === 0) return { error: "Select at least one file or folder." };
    const dest = destination.trim().replace(/^\/+/, "").replace(/\/+$/, "");
    const moves = paths.map((p) => {
      const clean = p.trim().replace(/^\/+/, "").replace(/\/+$/, "");
      const base = clean.split("/").pop() || clean;
      return { from: clean, to: dest ? `${dest}/${base}` : base };
    });
    return await movePaths(parsed.owner, parsed.repo, branch.trim(), moves, message?.trim() || `Move ${paths.length} item(s)`);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not move the selected items." };
  }
}

/** List the GitHub Models available to the account (for the file-editor chat). */
export async function listGithubModelsAction(): Promise<{ models: GithubModel[] } | { error: string }> {
  try {
    await requireOwner();
    return { models: await listGithubModels() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list GitHub models." };
  }
}

/** Run a Copilot (GitHub Models) chat completion for the file-editor chat panel. */
export async function copilotChatAction(
  model: string,
  messages: ChatMessage[]
): Promise<{ content: string; usage: ModelUsage } | { error: string }> {
  try {
    await requireOwner();
    if (!model.trim()) return { error: "Choose a model." };
    if (!messages || messages.length === 0) return { error: "Enter a message." };
    return await chatWithGithubModel(model, messages);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "The chat request failed." };
  }
}

/** Check student repo activity: list repos in an org with their last-commit date. */
export async function checkStudentActivityAction(
  org: string,
  prefix?: string
): Promise<{ rows: Array<{ repo: string; lastCommit: string | null; htmlUrl: string }> } | { error: string }> {
  try {
    await requireOwner();
    if (!org.trim()) return { error: "Provide a GitHub organization." };
    const repos = await listOrgRepos(org.trim(), prefix?.trim() || undefined);
    const rows = await Promise.all(
      repos.map(async (r) => {
        const [owner, name] = r.fullName.split("/");
        let lastCommit: string | null = null;
        try {
          const commits = await listCommits(owner, name, undefined, 1);
          lastCommit = commits[0]?.date || null;
        } catch {
          lastCommit = null;
        }
        return { repo: r.fullName, lastCommit, htmlUrl: r.htmlUrl };
      })
    );
    rows.sort((a, b) => (a.lastCommit ?? "").localeCompare(b.lastCommit ?? ""));
    return { rows };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read student activity." };
  }
}

/** The stable public base url this deployment is reachable at, for outbound webhook
 * registration. Must be the production domain (GitHub cannot reach preview/localhost). */
function publicWebhookBaseUrl(): string {
  const explicit = process.env.WEBHOOK_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProd) return `https://${vercelProd}`;
  return "https://teaching-assistant-pi.vercel.app";
}

/** Auto-register the GitHub org-level push webhook that feeds /api/github/webhook so
 * repo-push triggers fire instantly. Idempotent. Never returns the webhook secret. */
export async function registerOrgPushWebhookAction(
  org: string
): Promise<
  | { ok: true; url: string; hookId: number; alreadyExisted: boolean }
  | { ok: false; url: string; error: string }
> {
  const url = `${publicWebhookBaseUrl()}/api/github/webhook`;
  try {
    await requireOwner();
    const cleanOrg = org.trim();
    if (!cleanOrg) return { ok: false, url, error: "Provide a GitHub organization." };
    if (!githubConfigured()) {
      return { ok: false, url, error: "GitHub is not configured. Set the GITHUB_TOKEN environment variable." };
    }
    const secret = githubWebhookSecret();
    if (!secret) {
      return { ok: false, url, error: "Set the GITHUB_WEBHOOK_SECRET environment variable to enable instant webhooks." };
    }
    const { id, alreadyExisted } = await createOrgPushHook(cleanOrg, url, secret);
    return { ok: true, url, hookId: id, alreadyExisted };
  } catch (err) {
    return { ok: false, url, error: err instanceof Error ? err.message : "Could not register the webhook." };
  }
}

/** Generate a grading rubric from a repo's code (optionally guided by instructions). */
export async function generateRubricFromRepoAction(
  repoRef: string,
  instructions = "",
  provider: LlmProvider = "gemini",
  branch?: string
): Promise<{ rubric: string; fullName: string; fileCount: number } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const digest = await ingestRepo(parsed.owner, parsed.repo, {}, branch);
    const basis = `${instructions.trim() ? `${instructions.trim()}\n\n` : ""}Reference codebase (${digest.fullName}) — base the rubric criteria on the features, structure, and logic actually present here:\n\n${digest.text}`;
    const rubric = await generateRubric(basis, provider);
    return { rubric, fullName: digest.fullName, fileCount: digest.fileCount };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate a rubric." };
  }
}

/** One queued student repo to grade/test. */
export interface RepoQueueItem {
  repoRef: string;
  branch?: string;
  /** Friendly student label; falls back to the repo's full name. */
  label?: string;
}

/**
 * Turn a repo digest into a gradable entry for the embedded engine. The digest's
 * files become `submittedFiles` (so file-type / file-count checks are meaningful
 * and each file can be previewed), while `content` stays the concatenated text
 * that the keyword / code-symbol checks scan.
 */
function repoDigestToEmbeddedEntry(digest: RepoDigest, label?: string): StudentSubmissionEntry {
  const submittedFiles: SubmittedFileInfo[] = digest.files.map((file) => {
    const name = file.path.split("/").pop() || file.path;
    const extension = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
    return {
      name: file.path,
      extension,
      previewContent: file.content,
      previewTruncated: false,
      mimeType: "text/plain",
    };
  });
  return {
    student: label?.trim() || digest.fullName,
    content: digest.text,
    mergedFileCount: digest.fileCount,
    submittedFiles,
  };
}

/**
 * Grade several student repos against one rubric in a single run, so the results
 * matrix shows every student as a row. Generates a rubric from the first repo
 * when none is supplied.
 */
export async function gradeReposAction(
  repos: RepoQueueItem[],
  assignmentInstructions: string,
  rubric: string,
  provider: LlmProvider = "gemini"
): Promise<{ run: GradingRun; rubric: string } | { error: string }> {
  try {
    await requireOwner();
    const digests: Array<{ label?: string; digest: RepoDigest }> = [];
    for (const item of repos) {
      const parsed = parseRepoRef(item.repoRef);
      if (!parsed) continue;
      const digest = await ingestRepo(parsed.owner, parsed.repo, {}, item.branch || undefined);
      digests.push({ label: item.label, digest });
    }
    if (digests.length === 0) return { error: "No valid repositories to grade." };
    const instructions = assignmentInstructions.trim() || "Evaluate each student's repository.";

    // Embedded Deterministic Engine: grade each repo in-process against the
    // supplied rubric, or one generated from the instructions. No model call.
    if (provider === "embedded") {
      const builtRubric = buildEmbeddedRubric({ rubricText: rubric, instructions });
      if (builtRubric.checks.length === 0) {
        return { error: builtRubric.warnings[0] ?? "Provide a rubric or assignment instructions." };
      }
      // Grow the rubric bank from human-authored rubrics (fire-and-forget).
      if (rubric.trim()) void rememberRubric(instructions, rubric);
      const run = gradeEntriesEmbedded(
        digests.map(({ label, digest }) => repoDigestToEmbeddedEntry(digest, label)),
        builtRubric
      );
      return { run, rubric: renderRubricText(builtRubric) };
    }

    const entries: StudentSubmissionEntry[] = digests.map(({ label, digest }) => ({
      student: label?.trim() || digest.fullName,
      content: digest.text,
      mergedFileCount: digest.fileCount,
      submittedFiles: [],
    }));
    const effectiveRubric = rubric.trim() || (await generateRubric(`${instructions}\n\n${entries[0].content}`, provider));
    const run = await gradeEntries(entries, instructions, effectiveRubric, provider);
    return { run, rubric: effectiveRubric };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not grade the repositories." };
  }
}

/** List a repo's Actions workflows (so the user can choose which to run). */
export async function listWorkflowsAction(
  repoRef: string
): Promise<{ workflows: WorkflowInfo[] } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    return { workflows: await listWorkflows(parsed.owner, parsed.repo) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list workflows." };
  }
}

export async function dispatchWorkflowAction(
  repoRef: string,
  workflowRef: string,
  ref: string,
  inputs?: Record<string, string>
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    if (!workflowRef || !ref) return { error: "Choose a workflow and a branch to run." };
    await dispatchWorkflow(parsed.owner, parsed.repo, workflowRef, ref, inputs);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not dispatch the workflow." };
  }
}

/**
 * Trigger a repo's unit-test workflow (workflow_dispatch). `workflowRef` is a
 * workflow file name; when blank, the repo's first active workflow is used.
 * Returns the dispatch time so the caller can poll {@link getTestRunStatusAction}.
 */
export async function dispatchTestsAction(
  repoRef: string,
  branch?: string,
  workflowRef?: string
): Promise<{ since: string; ref: string } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const ref = branch?.trim() || (await getRepo(parsed.owner, parsed.repo)).defaultBranch;
    let wf = workflowRef?.trim();
    if (!wf) {
      const workflows = await listWorkflows(parsed.owner, parsed.repo);
      const chosen = workflows.find((w) => w.state === "active") ?? workflows[0];
      if (!chosen) return { error: "This repository has no Actions workflows to run." };
      wf = chosen.path.split("/").pop() || String(chosen.id);
    }
    const since = new Date().toISOString();
    await dispatchWorkflow(parsed.owner, parsed.repo, wf, ref);
    return { since, ref };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start the test run." };
  }
}

/** Aggregate pass/fail counts parsed from a run's JUnit report. */
export interface TestSummary {
  tests: number;
  failures: number;
  errors: number;
  skipped: number;
  passed: number;
}

// Sum the suite counters out of one JUnit XML document (prefers a top-level
// <testsuites> aggregate to avoid double-counting nested suites).
function parseJUnit(xml: string): TestSummary | null {
  const num = (tag: string, attr: string): number => Number(tag.match(new RegExp(`\\b${attr}="(\\d+)"`))?.[1] ?? 0);
  const aggregate = xml.match(/<testsuites\b[^>]*>/)?.[0];
  let tests = 0;
  let failures = 0;
  let errors = 0;
  let skipped = 0;
  if (aggregate && /\btests="/.test(aggregate)) {
    tests = num(aggregate, "tests");
    failures = num(aggregate, "failures");
    errors = num(aggregate, "errors");
    skipped = num(aggregate, "skipped");
  } else {
    const suites = xml.match(/<testsuite\b[^>]*>/g);
    if (!suites) return null;
    for (const s of suites) {
      tests += num(s, "tests");
      failures += num(s, "failures");
      errors += num(s, "errors");
      skipped += num(s, "skipped") + num(s, "disabled");
    }
  }
  if (tests === 0 && failures === 0 && errors === 0) return null;
  return { tests, failures, errors, skipped, passed: Math.max(0, tests - failures - errors - skipped) };
}

// Find a JUnit artifact on a completed run, unzip it, and sum its counts.
async function fetchJUnitSummary(owner: string, repo: string, runId: number): Promise<TestSummary | null> {
  const artifacts = await listRunArtifacts(owner, repo, runId);
  if (artifacts.length === 0) return null;
  const chosen = artifacts.find((a) => /test|result|junit|report/i.test(a.name)) ?? artifacts[0];
  const buffer = await downloadArtifactZip(owner, repo, chosen.id);
  const JSZipMod = (await import("jszip")).default;
  const zip = await JSZipMod.loadAsync(buffer);
  const xmlPaths: string[] = [];
  zip.forEach((path, entry) => {
    if (!entry.dir && /\.xml$/i.test(path)) xmlPaths.push(path);
  });
  let combined: TestSummary | null = null;
  for (const path of xmlPaths) {
    const xml = await zip.file(path)?.async("string");
    const summary = xml ? parseJUnit(xml) : null;
    if (!summary) continue;
    combined = combined
      ? {
          tests: combined.tests + summary.tests,
          failures: combined.failures + summary.failures,
          errors: combined.errors + summary.errors,
          skipped: combined.skipped + summary.skipped,
          passed: combined.passed + summary.passed,
        }
      : summary;
  }
  return combined;
}

/**
 * Poll the status of a dispatched test run (newest workflow_dispatch run since
 * `sinceIso`). Once the run is completed, also parse a JUnit artifact (if the
 * workflow uploaded one) into pass/fail counts.
 */
export async function getTestRunStatusAction(
  repoRef: string,
  ref: string,
  sinceIso: string
): Promise<{ run: WorkflowRunInfo | null; summary: TestSummary | null } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const run = await findWorkflowRunSince(parsed.owner, parsed.repo, ref, sinceIso);
    let summary: TestSummary | null = null;
    if (run && run.status === "completed") {
      try {
        summary = await fetchJUnitSummary(parsed.owner, parsed.repo, run.id);
      } catch {
        summary = null; // no readable JUnit report — fall back to the conclusion
      }
    }
    return { run, summary };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read the test run status." };
  }
}

// A test workflow per language/runtime: runs the tests and uploads a JUnit
// report as the "test-results" artifact, triggerable via the UI (workflow_dispatch).
function testWorkflowYaml(template: string, customCommand: string): string {
  const head = "name: Tests\non:\n  workflow_dispatch:\n  push:\n\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n";
  const upload = (path: string) =>
    `      - uses: actions/upload-artifact@v4\n        if: always()\n        with:\n          name: test-results\n          path: ${path}\n          if-no-files-found: ignore\n`;
  if (template === "python") {
    return (
      head +
      "      - uses: actions/setup-python@v5\n        with:\n          python-version: '3.x'\n" +
      "      - run: pip install -r requirements.txt || true\n" +
      "      - run: pip install pytest\n" +
      "      - run: pytest --junitxml=test-results/results.xml\n" +
      upload("test-results/")
    );
  }
  if (template === "node") {
    return (
      head +
      "      - uses: actions/setup-node@v4\n        with:\n          node-version: '20'\n" +
      "      - run: npm ci || npm install\n" +
      "      - run: npm test\n" +
      upload("'**/junit*.xml'")
    );
  }
  if (template === "java") {
    return (
      head +
      "      - uses: actions/setup-java@v4\n        with:\n          distribution: temurin\n          java-version: '17'\n" +
      "      - run: mvn -B test\n" +
      upload("'**/surefire-reports/*.xml'")
    );
  }
  // custom command
  const cmd = customCommand.trim() || "echo 'set a test command'";
  return head + `      - run: ${cmd}\n` + upload("'**/*.xml'");
}

/**
 * Write a standard unit-test workflow (.github/workflows/tests.yml) into a repo,
 * so repos without one become runnable from the UI. Needs the token's `workflow`
 * scope. `template` is "node" | "python" | "java" | "custom".
 */
export async function setupTestsWorkflowAction(
  repoRef: string,
  branch: string | undefined,
  template: string,
  customCommand = ""
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const yaml = testWorkflowYaml(template, customCommand);
    await putFile(parsed.owner, parsed.repo, ".github/workflows/tests.yml", yaml, "Add unit-test workflow", branch || undefined);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not add the test workflow." };
  }
}

// ── Organization + Repo Management ──────────────────────────────────────────

export async function listOrgMembersAction(org: string): Promise<{ members: OrgMember[] } | { error: string }> {
  try {
    await requireOwner();
    const trimmed = org.trim();
    if (!trimmed) return { error: "Choose an organization." };
    return { members: await listOrgMembers(trimmed) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list organization members." };
  }
}

export async function inviteOrgMemberAction(
  org: string,
  invitee: string,
  role: "admin" | "member"
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const trimmed = org.trim();
    if (!trimmed) return { error: "Choose an organization." };
    if (!invitee.trim()) return { error: "Enter a GitHub username or email to invite." };
    await inviteOrgMember(trimmed, invitee, role);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not invite the member." };
  }
}

export async function setOrgMemberRoleAction(
  org: string,
  username: string,
  role: "admin" | "member"
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const trimmed = org.trim();
    if (!trimmed) return { error: "Choose an organization." };
    await setOrgMemberRole(trimmed, username, role);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the member role." };
  }
}

export async function listRepoCollaboratorsAction(repoRef: string): Promise<{ collaborators: RepoCollaborator[] } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    return { collaborators: await listRepoCollaborators(parsed.owner, parsed.repo) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list collaborators." };
  }
}

export async function setRepoCollaboratorAction(
  repoRef: string,
  username: string,
  permission: RepoPermission
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await setRepoCollaborator(parsed.owner, parsed.repo, username, permission);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the collaborator." };
  }
}

export async function createPullRequestAction(
  repoRef: string,
  title: string,
  head: string,
  base: string,
  body: string
): Promise<{ number: number; htmlUrl: string } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    if (!title.trim()) return { error: "Enter a pull request title." };
    if (!head.trim()) return { error: "Enter the head branch." };
    if (!base.trim()) return { error: "Enter the base branch." };
    return await createPullRequest(parsed.owner, parsed.repo, { title, head, base, body });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the pull request." };
  }
}

export async function setBranchProtectionAction(
  repoRef: string,
  branch: string,
  opts: BranchProtectionOptions
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await setBranchProtection(parsed.owner, parsed.repo, branch, opts);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not set branch protection." };
  }
}

export async function listPersonalReposAction(): Promise<{ repos: GithubRepo[] } | { error: string }> {
  try {
    await requireOwner();
    return { repos: await listPersonalRepos() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list personal repositories." };
  }
}

export async function updateRepoAction(
  repoRef: string,
  patch: UpdateRepoPatch
): Promise<{ repo: GithubRepo } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const repo = await updateRepo(parsed.owner, parsed.repo, patch);
    return { repo };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the repository." };
  }
}

/** Grade a student's GitHub repo against a rubric (generating one if not given). */
export async function gradeRepoAction(
  repoRef: string,
  assignmentInstructions: string,
  rubric: string,
  provider: LlmProvider = "gemini",
  branch?: string
): Promise<{ run: GradingRun; rubric: string; fullName: string } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const digest = await ingestRepo(parsed.owner, parsed.repo, {}, branch);
    const instructions = assignmentInstructions.trim() || `Evaluate the repository "${digest.fullName}".`;

    // Embedded Deterministic Engine: grade the repo in-process against the
    // supplied rubric, or one generated from the instructions. No model call.
    if (provider === "embedded") {
      const builtRubric = buildEmbeddedRubric({ rubricText: rubric, instructions });
      if (builtRubric.checks.length === 0) {
        return { error: builtRubric.warnings[0] ?? "Provide a rubric or assignment instructions." };
      }
      // Grow the rubric bank from human-authored rubrics (fire-and-forget).
      if (rubric.trim()) void rememberRubric(instructions, rubric);
      const run = gradeEntriesEmbedded([repoDigestToEmbeddedEntry(digest)], builtRubric);
      return { run, rubric: renderRubricText(builtRubric), fullName: digest.fullName };
    }

    const effectiveRubric = rubric.trim() || (await generateRubric(`${instructions}\n\n${digest.text}`, provider));
    const entry: StudentSubmissionEntry = {
      student: digest.fullName,
      content: digest.text,
      mergedFileCount: digest.fileCount,
      submittedFiles: [],
    };
    const run = await gradeEntries([entry], instructions, effectiveRubric, provider);
    return { run, rubric: effectiveRubric, fullName: digest.fullName };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not grade the repository." };
  }
}

/**
 * Download a repo as a zip whose entries sit at the root (GitHub wraps everything
 * in a "<repo>-<sha>/" folder; we strip it) so the result is a drop-in for the
 * uploaded-zip flows in lecture and syllabus planning.
 */
export async function getRepoZipAction(
  repoRef: string,
  branch?: string
): Promise<{ base64: string; name: string } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const buffer = await downloadRepoZipball(parsed.owner, parsed.repo, branch);
    const JSZipMod = (await import("jszip")).default;
    const src = await JSZipMod.loadAsync(buffer);
    // The wrapper folder is the common first path segment of every entry.
    let wrapper = "";
    src.forEach((path) => {
      if (!wrapper) wrapper = path.split("/")[0];
    });
    const out = new JSZipMod();
    const entries: Array<{ path: string; file: import("jszip").JSZipObject }> = [];
    src.forEach((path, file) => {
      if (!file.dir) entries.push({ path, file });
    });
    for (const { path, file } of entries) {
      const stripped = wrapper && path.startsWith(`${wrapper}/`) ? path.slice(wrapper.length + 1) : path;
      if (stripped) out.file(stripped, await file.async("uint8array"));
    }
    const base64 = await out.generateAsync({ type: "base64" });
    return { base64, name: `${parsed.repo}.zip` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not download the repository." };
  }
}

/** Read a repo's latest GitHub Actions run (CI signal for the grading view). */
export async function getRepoCiAction(
  repoRef: string,
  branch?: string
): Promise<{ run: WorkflowRunInfo | null } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    return { run: await getLatestWorkflowRun(parsed.owner, parsed.repo, branch) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read CI status." };
  }
}

// ── Course schedule generation ──────────────────────────────────────────────────

/** Represents a single week in a course schedule with topic, assignments, and tests. */
export interface ScheduleWeekPlan {
  /** The week number (1-based). */
  week: number;
  /** Short topic name for the week. */
  topic: string;
  /** 1-2 sentence description of the week's learning outcomes. */
  summary: string;
  /** Title of the assignment for this week, or null if this week has a test instead. */
  assignmentTitle: string | null;
  /** Kebab-case unique slug for the assignment folder (e.g., "week-01-variables"), or null. */
  assignmentSlug: string | null;
  /** Name of the test for this week (e.g., "Test 1"), or null if no test this week. */
  testName: string | null;
}

/**
 * Generate a course schedule from a high-level description, distributing assignments and tests evenly.
 * Returns a courseTitle and the structured week plan used by workflows (assignment slugs + test
 * flags), unlike generateCourseScheduleAction, which produces display rows for the syllabus.
 */
export async function generateSchedulePlanAction(
  courseDescription: string,
  weeks: number,
  tests: number,
  provider: LlmProvider = "gemini"
): Promise<{ courseTitle: string; schedule: ScheduleWeekPlan[] } | { error: string }> {
  try {
    await requireOwner();

    // Validate inputs
    if (!courseDescription.trim()) return { error: "Enter a course description." };
    const weekCount = Number(weeks);
    if (!Number.isInteger(weekCount) || weekCount < 1 || weekCount > 52) {
      return { error: "Enter a number of weeks between 1 and 52." };
    }
    const testCount = Number(tests);
    if (!Number.isInteger(testCount) || testCount < 0 || testCount > weekCount) {
      return { error: "The number of tests must be between 0 and the number of weeks." };
    }

    // Call LLM to generate schedule
    const prompt = `You are an expert curriculum designer. Given a course description, produce a JSON object ONLY (no markdown fences) with:
- "courseTitle": a clear, concise title for the course
- "weeks": an array with exactly ${weekCount} week objects, each with:
  - "week": 1-based week number
  - "topic": short topic name
  - "summary": 1-2 sentence description
  - "assignmentTitle": string or null (null only for test weeks)
  - "assignmentSlug": kebab-case slug like "week-01-variables" or null
  - "testName": string like "Test 1" or null

Distribute exactly ${testCount} tests evenly across the term (final test in week ${weekCount} if tests > 0).
Every non-test week must have an assignment reinforcing the week's topic.
Topics should progress from foundational to advanced.

Course description:
${courseDescription}`;

    const r = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 8192 },
      },
      provider
    );

    if (!r.ok) return { error: "The model returned no schedule." };

    const parsed = extractJsonObject(r.text);
    if (!parsed || typeof parsed !== "object") {
      return { error: "Could not parse the generated schedule. Try again." };
    }

    // Extract and validate weeks array
    const weeksArray = parsed.weeks;
    if (!Array.isArray(weeksArray)) {
      return { error: "Could not parse the generated schedule. Try again." };
    }

    if (weeksArray.length < weekCount) {
      return { error: "The model returned the wrong number of weeks. Try again." };
    }

    // Trim to exact count if extras exist
    const schedule: ScheduleWeekPlan[] = weeksArray.slice(0, weekCount).map((entry: unknown) => {
      if (typeof entry !== "object" || entry === null) {
        return {
          week: 0,
          topic: "",
          summary: "",
          assignmentTitle: null,
          assignmentSlug: null,
          testName: null,
        };
      }
      const e = entry as Record<string, unknown>;
      return {
        week: Number(e.week) || 0,
        topic: typeof e.topic === "string" ? e.topic.trim() : "",
        summary: typeof e.summary === "string" ? e.summary.trim() : "",
        assignmentTitle: typeof e.assignmentTitle === "string" ? e.assignmentTitle.trim() : null,
        assignmentSlug: typeof e.assignmentSlug === "string" ? e.assignmentSlug.trim() : null,
        testName: typeof e.testName === "string" ? e.testName.trim() : null,
      };
    });

    // Derive courseTitle with fallback
    let courseTitle = "";
    if (typeof parsed.courseTitle === "string") {
      courseTitle = parsed.courseTitle.trim();
    }
    if (!courseTitle) {
      // Fallback: first sentence of description, trimmed to 80 chars
      const firstSentence = courseDescription.trim().split(/[.!?]/)[0] || courseDescription.trim();
      courseTitle = firstSentence.slice(0, 80).trim();
    }

    return { courseTitle, schedule };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate the schedule." };
  }
}

/**
 * Generate lecture materials (slides, module intro, assignment instructions) from a course schedule.
 * Takes a parsed schedule (ScheduleWeekPlan[] JSON) and generates one AssignmentPlan per week with a topic.
 * Returns AssignmentPlan[] shaped entries | error.
 */
export async function generateLectureMaterialsFromScheduleAction(
  scheduleJson: string,
  courseDescription: string,
  minutes: number,
  provider: LlmProvider = "gemini"
): Promise<AssignmentPlan[] | { error: string }> {
  try {
    await requireOwner();

    // Parse the schedule JSON
    let schedule: ScheduleWeekPlan[];
    try {
      const parsed = JSON.parse(scheduleJson);
      if (!Array.isArray(parsed)) {
        return { error: "Schedule must be a JSON array." };
      }
      schedule = parsed;
    } catch (err) {
      return {
        error: err instanceof Error
          ? `Could not parse schedule JSON: ${err.message}`
          : "Could not parse schedule JSON.",
      };
    }

    if (schedule.length === 0) {
      return { error: "Schedule is empty." };
    }

    const lectureDurationMinutes = Math.max(5, Math.min(Number(minutes) || 50, 240));

    // Filter to weeks with a non-empty topic
    const weeksWithTopics = schedule.filter((w) => w.topic && w.topic.trim());

    if (weeksWithTopics.length === 0) {
      return { error: "No weeks with topics found in the schedule." };
    }

    // Generate one plan per week, with concurrency limit to respect LLM rate limits
    const SCHEDULE_PLAN_CONCURRENCY = 4;
    const plans = await mapWithConcurrency(
      weeksWithTopics,
      SCHEDULE_PLAN_CONCURRENCY,
      (week, index) =>
        buildScheduleWeekPlan(
          week,
          index,
          courseDescription,
          lectureDurationMinutes,
          provider
        )
    );

    if (plans.length === 0) {
      return { error: "No materials could be generated from the schedule." };
    }

    return plans;
  } catch (err) {
    return {
      error: err instanceof Error
        ? err.message
        : "Could not generate lecture materials from schedule.",
    };
  }
}

/**
 * Generate a single week's materials (slides + intro + instructions) from the topic and course context.
 * Mirrors buildAssignmentPlan but operates on schedule week data instead of repo content.
 */
async function buildScheduleWeekPlan(
  week: ScheduleWeekPlan,
  index: number,
  courseDescription: string,
  lectureDurationMinutes: number,
  provider: LlmProvider
): Promise<AssignmentPlan> {
  const weekNumber = week.week || index + 1;
  const label = `Week ${weekNumber}`;
  const topic = week.topic.trim();
  const summary = week.summary?.trim() || "";
  const assignmentTitle = week.assignmentTitle?.trim() || `Week ${weekNumber} Deliverable`;

  // Generate slides only (one LLM call per week cap)
  const slidesResult = await generateSlidesFromTopic(topic, summary, courseDescription, lectureDurationMinutes, provider);

  // Degrade gracefully if slide generation fails
  const slidesFailed = "error" in slidesResult;
  if (slidesFailed) {
    console.error(`Slide generation failed for "Week ${weekNumber}": ${slidesResult.error}`);
  }
  const slides = slidesFailed ? [] : slidesResult.slides;

  // Build intro and instructions deterministically
  const moduleIntroduction = scaffoldModuleIntroDoc(label, summary);
  const assignmentInstructions = scaffoldAssignmentDoc(assignmentTitle, `${topic}\n${summary}`);

  return {
    assignmentName: `week-${String(weekNumber).padStart(2, "0")}`,
    slides,
    slidesFailed: slidesFailed ? true : undefined,
    presentationTitle: topic || label,
    label,
    moduleIntroduction,
    assignmentInstructions,
    weekNumber,
    introTemplateHeadings: [],
    instructionsTemplateHeadings: [],
  } satisfies AssignmentPlan;
}

/**
 * Generate slides from a schedule week's topic and context.
 */
async function generateSlidesFromTopic(
  topic: string,
  summary: string,
  courseDescription: string,
  lectureDurationMinutes: number,
  provider: LlmProvider
): Promise<{ presentationTitle: string; slides: SlideData[] } | { error: string }> {
  // Embedded Deterministic Engine
  if (provider === "embedded") {
    return scaffoldLessonPlan(topic, summary);
  }

  const prompt = `You are an expert educator creating a lecture slide deck for a course. The slides must be fully self-contained — students reading them after class must be able to understand every concept without relying on any verbal explanation from the instructor.

TOPIC: ${topic}

WEEK SUMMARY: ${summary}

COURSE DESCRIPTION: ${courseDescription}

LECTURE DURATION: ${lectureDurationMinutes} minutes

Based on the topic and summary above, create a complete lecture slide deck that teaches students the key concepts and skills for this week. Scale the number of slides to fit a ${lectureDurationMinutes}-minute lecture (roughly 1–2 minutes per slide on average).

Return ONLY valid JSON:
${SLIDE_DECK_JSON_SHAPE}

Requirements:
${SLIDE_STRUCTURE_REQUIREMENTS}`;

  let parsed: {
    presentationTitle?: string;
    slides?: Array<{ title?: string; bullets?: string[]; code?: string; codeLanguage?: string }>;
  } | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 12288 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `LLM API error for "${topic}": HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const jsonText = jsonObjectSlice(result.text);
    if (!jsonText) {
      if (attempt === 1) {
        console.error(`Slide JSON parse failed for "${topic}" (attempt 1): no JSON object in the response`);
        continue;
      }
      return { error: `Could not parse slide data for "${topic}".` };
    }

    try {
      parsed = JSON.parse(jsonText) as {
        presentationTitle?: string;
        slides?: Array<{ title?: string; bullets?: string[]; code?: string; codeLanguage?: string }>;
      };
      break;
    } catch (err) {
      if (attempt === 1) {
        console.error(
          `Slide JSON parse failed for "${topic}" (attempt 1): ${err instanceof Error ? err.message : String(err)}`
        );
        continue;
      }
      return { error: `Could not parse slide data for "${topic}".` };
    }
  }

  if (!parsed) {
    return { error: `Could not parse slide data for "${topic}".` };
  }

  if (!parsed.slides || !Array.isArray(parsed.slides)) {
    return { error: `Model did not return a valid slides array for "${topic}".` };
  }

  let slides: SlideData[] = parsed.slides
    .filter((s) => typeof s.title === "string" && Array.isArray(s.bullets))
    .map((s) => toSlideData(s, 4));

  slides = propagateExampleCodeToFollowups(slides);

  return {
    presentationTitle: parsed.presentationTitle ?? topic,
    slides,
  };
}


/**
 * Generate a course schedule from a repository's actual assignment structure,
 * deriving week plan and test distribution from the found assignment folders.
 * Returns a courseTitle and the structured week plan used by workflows.
 */
export async function generateSchedulePlanFromRepoAction(
  repoRef: string,
  weeks: number | null,
  tests: number | null,
  provider: LlmProvider = "gemini",
  courseDescription?: string
): Promise<{ courseTitle: string; schedule: ScheduleWeekPlan[] } | { error: string }> {
  try {
    await requireOwner();

    // Parse and validate repo reference
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const { owner, repo } = parsed;

    // Download and load the repo zipball
    const buffer = await downloadRepoZipball(owner, repo);
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buffer);
    const allPaths = Object.keys(zip.files);

    // Find assignment folders
    const prefix = findAssignmentsPrefix(allPaths);
    if (!prefix) {
      return { error: "No assignment folders found in the repository." };
    }

    const folders = listAssignmentFolders(allPaths, prefix);
    if (folders.length === 0) {
      return { error: "No assignment folders found in the repository." };
    }

    // Extract content bundles for each folder
    const bundles: (AssignmentContentBundle | null)[] = [];
    for (const folder of folders) {
      const bundle = await extractAssignmentContentBundle(zip, allPaths, prefix, folder);
      bundles.push(bundle);
    }

    // Filter out null bundles
    const validBundles = bundles.filter((b) => b !== null) as AssignmentContentBundle[];
    if (validBundles.length === 0) {
      return { error: "No assignment folders found in the repository." };
    }

    // Read README.md if present (under the prefix wrapper)
    let readmeContent = "";
    const readmeFiles = allPaths.filter(
      (p) => p.startsWith(prefix) && p.toLowerCase().endsWith("readme.md")
    );
    if (readmeFiles.length > 0) {
      try {
        const readmeFile = readmeFiles[0];
        let content = await zip.files[readmeFile].async("string");
        if (content.length > 4000) {
          content = content.slice(0, 4000) + "\n... (truncated)";
        }
        readmeContent = content;
      } catch {
        // skip unreadable README
      }
    }

    // Derive week and test counts
    const folderCount = validBundles.length;
    const weekCount = Number.isInteger(weeks) && weeks !== null && weeks > 0 && weeks <= 52
      ? Math.min(weeks, 52)
      : folderCount;
    const testCount = Number.isInteger(tests) && tests !== null && tests >= 0 && tests <= weekCount
      ? tests
      : 0;

    // Build per-folder digest strings (truncated to ~2000 chars each)
    const folderDigests: string[] = [];
    for (const bundle of validBundles) {
      let digest = `Folder: ${bundle.name}\n`;
      let contentSlice = bundle.content;
      if (contentSlice.length > 2000) {
        contentSlice = contentSlice.slice(0, 2000) + "\n... (truncated)";
      }
      digest += contentSlice;
      folderDigests.push(digest);
    }

    // Build the prompt
    const prompt = `You are an expert curriculum designer. Given a repository's assignment folders with their content, plus the README, produce a JSON object ONLY (no markdown fences) with:
- "courseTitle": a clear, concise title for the course
- "weeks": an array with exactly ${weekCount} week objects, each with:
  - "week": 1-based week number
  - "topic": short topic name
  - "summary": 1-2 sentence description
  - "assignmentTitle": string or null (null only for review/test weeks)
  - "assignmentSlug": kebab-case slug matching the folder name exactly, or null
  - "testName": string like "Test 1" or null

Requirements:
- Each of the ${folderCount} assignment folders must appear as exactly ONE week's assignment IN ORDER, with assignmentSlug set to its folder name.
- Distribute exactly ${testCount} tests evenly (place final test in week ${weekCount} if testCount > 0).
- Weeks beyond folder count should have review/consolidation topics with null assignment and null test.
- Every non-test week must have an assignment.
- Topics should progress from foundational to advanced.
${courseDescription ? `- Topics and summaries should align with the course description provided below.` : ""}

${courseDescription ? `COURSE DESCRIPTION (context from the instructor):
${courseDescription.length > 2000 ? courseDescription.slice(0, 2000) + "\n... (truncated)" : courseDescription}

` : ""}Repository README:
${readmeContent}

Assignment folders and their content:
${folderDigests.join("\n\n---\n\n")}`;

    const r = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
      },
      provider
    );

    if (!r.ok) return { error: "The model returned no schedule." };

    const parsedPlan = extractJsonObject(r.text);
    if (!parsedPlan || typeof parsedPlan !== "object") {
      return { error: "Could not parse the generated schedule. Try again." };
    }

    // Extract and validate weeks array
    const weeksArray = parsedPlan.weeks;
    if (!Array.isArray(weeksArray)) {
      return { error: "Could not parse the generated schedule. Try again." };
    }

    if (weeksArray.length < weekCount) {
      return { error: "The model returned the wrong number of weeks. Try again." };
    }

    // Trim to exact count if extras exist
    const schedule: ScheduleWeekPlan[] = weeksArray.slice(0, weekCount).map((entry: unknown) => {
      if (typeof entry !== "object" || entry === null) {
        return {
          week: 0,
          topic: "",
          summary: "",
          assignmentTitle: null,
          assignmentSlug: null,
          testName: null,
        };
      }
      const e = entry as Record<string, unknown>;
      return {
        week: Number(e.week) || 0,
        topic: typeof e.topic === "string" ? e.topic.trim() : "",
        summary: typeof e.summary === "string" ? e.summary.trim() : "",
        assignmentTitle: typeof e.assignmentTitle === "string" ? e.assignmentTitle.trim() : null,
        assignmentSlug: typeof e.assignmentSlug === "string" ? e.assignmentSlug.trim() : null,
        testName: typeof e.testName === "string" ? e.testName.trim() : null,
      };
    });

    // Derive courseTitle with fallback (repo name)
    let courseTitle = "";
    if (typeof parsedPlan.courseTitle === "string") {
      courseTitle = parsedPlan.courseTitle.trim();
    }
    if (!courseTitle) {
      courseTitle = repo.charAt(0).toUpperCase() + repo.slice(1);
    }

    return { courseTitle, schedule };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate the schedule from the repository." };
  }
}

/**
 * Generate and write assignment README.md files based on a course schedule.
 * Creates one README per assignment in the course, with objectives, directions, deliverables, and submission instructions.
 */
export async function fillAssignmentReadmesAction(
  repoRef: string,
  schedule: ScheduleWeekPlan[],
  courseDescription: string,
  provider: LlmProvider = "gemini"
): Promise<{ written: string[]; repoUrl: string } | { error: string }> {
  try {
    await requireOwner();

    // Parse and validate repo reference
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const { owner, repo } = parsed;

    // Collect assignments (non-null assignmentTitle, sorted by week)
    const assignments = schedule
      .filter((w) => w.assignmentTitle !== null)
      .sort((a, b) => a.week - b.week);

    if (assignments.length === 0) {
      return { error: "The schedule contains no assignments to document." };
    }

    // Fetch repo tree
    let allPaths: string[] = [];
    try {
      const tree = await getRepoTree(owner, repo);
      allPaths = tree.map((e: RepoTreeEntry) => e.path);
    } catch {
      allPaths = [];
    }

    // Determine assignments folder prefix using the same logic as findAssignmentsPrefix
    const candidatePattern = /^(assignments?|homeworks?|hw|labs?|projects?|exercises?|problems?)$/i;
    let prefix = "";
    const topFolders = new Set<string>();
    for (const path of allPaths) {
      const m = path.match(/^([^/]+)\//);
      if (m) topFolders.add(m[1]);
    }
    for (const folder of topFolders) {
      if (candidatePattern.test(folder)) {
        prefix = folder + "/";
        break;
      }
    }
    if (!prefix) {
      for (const path of allPaths) {
        const m = path.match(/^[^/]+\/([^/]+)\//);
        if (m && candidatePattern.test(m[1])) {
          const firstSlash = path.indexOf("/");
          const secondSlash = path.indexOf("/", firstSlash + 1);
          if (firstSlash !== -1 && secondSlash !== -1) {
            prefix = path.slice(0, secondSlash + 1);
            break;
          }
        }
      }
    }
    if (!prefix) prefix = "assignments/";

    // Extract existing assignment folders (unique sorted second-level folder names)
    const existingFolders = new Set<string>();
    for (const path of allPaths) {
      if (path.startsWith(prefix)) {
        const parts = path.slice(prefix.length).split("/");
        if (parts.length >= 2 && parts[0]) existingFolders.add(parts[0]);
      }
    }
    const existingList = Array.from(existingFolders).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );

    // Helper to sanitize slug
    const sanitizeSlug = (slug: string): string => {
      return slug
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");
    };

    // Build target folder for each assignment
    const assignmentFolders: Array<{ week: number; folder: string; title: string; topic: string; summary: string }> = [];
    for (let i = 0; i < assignments.length; i++) {
      const a = assignments[i];
      let folder: string;
      if (i < existingList.length) {
        folder = existingList[i];
      } else {
        const slug = a.assignmentSlug ? sanitizeSlug(a.assignmentSlug) : "assignment";
        folder = `week-${String(a.week).padStart(2, "0")}-${slug}`;
      }
      assignmentFolders.push({
        week: a.week,
        folder,
        title: a.assignmentTitle || "",
        topic: a.topic,
        summary: a.summary,
      });
    }

    // Call LLM once to generate all READMEs
    const assignmentsList = assignmentFolders
      .map((a) => `Week ${a.week}: "${a.title}" (${a.topic}) - ${a.summary}`)
      .join("\n");

    const llmPrompt = `You are an instructor creating assignment documentation. Generate GitHub-flavored markdown README.md files for these assignments.

Course description: ${courseDescription}

Assignments:
${assignmentsList}

Return ONLY a JSON array with one object per assignment, in the same order:
[
  {
    "week": number,
    "readme": "complete markdown with H1 title, overview paragraph, ## Objectives (bullets), ## Directions (numbered steps), ## Deliverables (bullets), ## Submission (paragraph). 200-400 words. No emojis."
  },
  ...
]`;

    const llmRes = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: llmPrompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
      },
      provider
    );

    if (!llmRes.ok) return { error: "The model returned no directions." };

    const readmesRaw = parseLenientJsonArray(llmRes.text);
    if (!readmesRaw || !Array.isArray(readmesRaw)) {
      return { error: "Could not parse the generated directions. Try again." };
    }

    // Map by array order, skip extras
    const readmesMap = new Map<number, string>();
    readmesRaw.forEach((item: unknown, idx: number) => {
      if (idx < assignmentFolders.length && typeof item === "object" && item !== null) {
        const i = item as Record<string, unknown>;
        if (typeof i.readme === "string") {
          readmesMap.set(idx, i.readme);
        }
      }
    });

    // Write each assignment README
    const written: string[] = [];
    for (let i = 0; i < assignmentFolders.length; i++) {
      const a = assignmentFolders[i];
      const readme = readmesMap.get(i);
      if (!readme) continue;

      const filePath = `${prefix}${a.folder}/README.md`;
      try {
        await putFile(owner, repo, filePath, readme, `Add assignment directions: ${a.title}`);
        written.push(filePath);
      } catch {
        // Continue on individual write failures
      }
    }

    if (written.length === 0) {
      return { error: "No README files could be written to the repository." };
    }

    return { written, repoUrl: `https://github.com/${owner}/${repo}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not fill assignment directions." };
  }
}

// ── Assignment instruction sync (Canvas <-> repo) ─────────────────────────────

const assignmentSlug = (title: string): string =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "assignment";

function parseAssignmentRef(
  assignmentUrl: string,
  repoRef: string
): { assignmentId: string; owner: string; repo: string } | { error: string } {
  const assignmentId = assignmentUrl.match(/\/assignments\/(\d+)/)?.[1];
  if (!assignmentId) return { error: "Paste a Canvas assignment URL (…/courses/<id>/assignments/<id>)." };
  const parsed = parseRepoRef(repoRef);
  if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
  return { assignmentId, owner: parsed.owner, repo: parsed.repo };
}

/** Load both sides of an assignment's instructions (Canvas + repo file) for review. */
export async function getAssignmentSyncStateAction(
  assignmentUrl: string,
  repoRef: string,
  path: string,
  acronym?: string,
  branch?: string
): Promise<
  { title: string; canvasMarkdown: string; repoMarkdown: string | null; path: string } | { error: string }
> {
  try {
    await requireOwner();
    const ref = parseAssignmentRef(assignmentUrl, repoRef);
    if ("error" in ref) return ref;
    const item = await getAccessibilityItem(assignmentUrl, "assignment", ref.assignmentId, acronym);
    if (!item) return { error: "Could not load that Canvas assignment." };
    const resolvedPath = path.trim() || `assignments/${assignmentSlug(item.title)}/README.md`;
    let repoMarkdown: string | null = null;
    try {
      repoMarkdown = await getFileText(ref.owner, ref.repo, resolvedPath, branch);
    } catch {
      repoMarkdown = null; // file not there yet
    }
    return { title: item.title, canvasMarkdown: htmlToMarkdown(item.html), repoMarkdown, path: resolvedPath };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the assignment." };
  }
}

/** Push Canvas assignment instructions into the repo file (as Markdown). */
export async function syncAssignmentToRepoAction(
  assignmentUrl: string,
  repoRef: string,
  path: string,
  acronym?: string,
  branch?: string
): Promise<{ ok: true; path: string } | { error: string }> {
  try {
    await requireOwner();
    const ref = parseAssignmentRef(assignmentUrl, repoRef);
    if ("error" in ref) return ref;
    const item = await getAccessibilityItem(assignmentUrl, "assignment", ref.assignmentId, acronym);
    if (!item) return { error: "Could not load that Canvas assignment." };
    const resolvedPath = path.trim() || `assignments/${assignmentSlug(item.title)}/README.md`;
    const markdown = `# ${item.title}\n\n${htmlToMarkdown(item.html)}\n`;
    await putFile(ref.owner, ref.repo, resolvedPath, markdown, `Sync "${item.title}" instructions from Canvas`, branch);
    return { ok: true, path: resolvedPath };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not write to the repository." };
  }
}

/** Pull the repo file (Markdown) into the Canvas assignment description (as HTML). */
export async function syncAssignmentFromRepoAction(
  assignmentUrl: string,
  repoRef: string,
  path: string,
  acronym?: string,
  branch?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const ref = parseAssignmentRef(assignmentUrl, repoRef);
    if ("error" in ref) return ref;
    if (!path.trim()) return { error: "Specify the repo file path to pull from." };
    let markdown: string;
    try {
      markdown = await getFileText(ref.owner, ref.repo, path.trim(), branch);
    } catch {
      return { error: "That file wasn't found in the repository." };
    }
    await saveAccessibilityItemHtml(assignmentUrl, "assignment", ref.assignmentId, markdownToHtml(markdown), acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the Canvas assignment." };
  }
}

/** Generate a teachable course outline (weekly schedule + assignments) from a repo. */
export async function generateCourseFromRepoAction(
  repoRef: string,
  provider: LlmProvider = "gemini"
): Promise<{ outline: string; fullName: string; fileCount: number; truncated: boolean } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const digest = await ingestRepo(parsed.owner, parsed.repo);

    // Embedded Deterministic Engine: template the outline from the repo's
    // structure with no model call.
    if (provider === "embedded") {
      const outline = scaffoldCourseOutline(digest.fullName, digest.files.map((f) => f.path), digest.truncated);
      return { outline, fullName: digest.fullName, fileCount: digest.fileCount, truncated: digest.truncated };
    }

    const prompt = `You are an instructional designer building a course that teaches the concepts, technologies, and skills demonstrated in the codebase below.

Produce a course outline as clean Markdown with:
- A one-paragraph course summary naming the main technologies and what students will learn.
- A weekly schedule of 8-14 weeks. For each week: "## Week N — <topic>", a short description, the key concepts/files from this codebase it draws on, and 1-2 assignments ("**Assignment:** ...") grounded in the actual code.
- A final "## Capstone" tied to extending or rebuilding part of this project.

Base everything on what the code actually contains — do not invent technologies that are not present. Keep it practical and specific.

CODEBASE (${digest.fullName}${digest.truncated ? ", truncated" : ""}):
${digest.text}`;
    const result = await callLlm(
      { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 2600 } },
      provider
    );
    if (!result.ok) return { error: `Generation failed: HTTP ${result.status}` };
    const outline = result.text.trim();
    if (!outline) return { error: "The model returned an empty outline." };
    return { outline, fullName: digest.fullName, fileCount: digest.fileCount, truncated: digest.truncated };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate the course." };
  }
}

// ── Repository operations (fork, branches, commits, PRs, Actions) ───────────

export async function forkRepoAction(repoRef: string, org?: string): Promise<{ repo: GithubRepo } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const repo = await forkRepo(parsed.owner, parsed.repo, org?.trim());
    return { repo };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not fork the repository." };
  }
}

export async function copyRepoAction(
  repoRef: string,
  opts: CopyRepoOptions
): Promise<{ result: CopyRepoResult } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const result = await copyRepo(parsed.owner, parsed.repo, opts);
    return { result };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not copy the repository." };
  }
}

export async function copyPathsToRepoAction(
  repoRef: string,
  opts: CopyPathsOptions
): Promise<{ result: CopyPathsResult } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const result = await copyPathsToRepo(parsed.owner, parsed.repo, opts);
    return { result };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not copy files to the repository." };
  }
}

export async function detectRepoFrontendAction(fullName: string): Promise<{ frontend: { framework: string; devCommand: string } | null; backend: BackendInfo | null } | { error: string }> {
  try {
    await requireOwner();
    const parts = fullName.split("/");
    if (parts.length !== 2) {
      return { frontend: null, backend: null };
    }
    const [owner, repo] = parts;

    // Fetch files in parallel with individual catches
    const [packageJsonResult, requirementsTxtResult, pyprojectTomlResult, pipfileResult] = await Promise.all([
      getFileText(owner, repo, "package.json").catch(() => undefined),
      getFileText(owner, repo, "requirements.txt").catch(() => undefined),
      getFileText(owner, repo, "pyproject.toml").catch(() => undefined),
      getFileText(owner, repo, "Pipfile").catch(() => undefined),
    ]);

    const frontend = classifyFrontend(packageJsonResult ?? "");
    const backend = classifyBackend({
      packageJson: packageJsonResult,
      requirementsTxt: requirementsTxtResult,
      pyprojectToml: pyprojectTomlResult,
      pipfile: pipfileResult,
    });

    return { frontend, backend };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not detect frontend/backend framework." };
  }
}

export async function createBranchAction(repoRef: string, newBranch: string, fromBranch: string): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    if (!newBranch.trim()) return { error: "Enter a new branch name." };
    if (!fromBranch.trim()) return { error: "Select a source branch." };
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await createBranch(parsed.owner, parsed.repo, newBranch.trim(), fromBranch.trim());
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the branch." };
  }
}

export async function deleteBranchAction(repoRef: string, branch: string): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    if (!branch.trim()) return { error: "Select a branch to delete." };
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await deleteBranch(parsed.owner, parsed.repo, branch.trim());
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the branch." };
  }
}

export async function listCommitsAction(repoRef: string, ref?: string): Promise<{ commits: CommitInfo[] } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const commits = await listCommits(parsed.owner, parsed.repo, ref?.trim());
    return { commits };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list commits." };
  }
}

export async function listPullRequestsAction(repoRef: string, state: "open" | "closed" | "all" = "open"): Promise<{ pulls: PullRequestInfo[] } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const pulls = await listPullRequests(parsed.owner, parsed.repo, state);
    return { pulls };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list pull requests." };
  }
}

export async function mergePullRequestAction(repoRef: string, prNumber: number, method: "merge" | "squash" | "rebase" = "merge"): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await mergePullRequest(parsed.owner, parsed.repo, prNumber, method);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not merge the pull request." };
  }
}

export async function markPullRequestReadyAction(repoRef: string, prNumber: number): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await markPullRequestReady(parsed.owner, parsed.repo, prNumber);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not mark the pull request as ready." };
  }
}

/**
 * Attention counts for a repo's badges: open non-draft pull requests (agent or
 * human, awaiting review/merge) and workflow runs blocked on approval
 * (waiting = deployment review, action_required = fork approval).
 */
export async function getRepoAttentionAction(
  repoRef: string
): Promise<{ openPrs: number; agentPrs: number; runsNeedingApproval: number } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const [pulls, waiting, actionRequired] = await Promise.all([
      listPullRequests(parsed.owner, parsed.repo, "open"),
      listWorkflowRuns(parsed.owner, parsed.repo, { status: "waiting", perPage: 50 }),
      listWorkflowRuns(parsed.owner, parsed.repo, { status: "action_required", perPage: 50 }),
    ]);
    const ready = pulls.filter((p) => !p.draft);
    return {
      openPrs: ready.length,
      // Copilot coding-agent PRs work on copilot/* branches; a ready (non-draft)
      // one means the agent finished and is waiting on review.
      agentPrs: ready.filter((p) => p.head.startsWith("copilot/")).length,
      runsNeedingApproval: waiting.length + actionRequired.length,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load attention counts." };
  }
}

/** List the reviews submitted on a pull request. */
export async function listPullRequestReviewsAction(
  repoRef: string,
  prNumber: number
): Promise<{ reviews: PullRequestReviewInfo[] } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    return { reviews: await listPullRequestReviews(parsed.owner, parsed.repo, prNumber) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load reviews." };
  }
}

/** List the files a pull request changes, with their diffs. */
export async function listPullRequestFilesAction(
  repoRef: string,
  prNumber: number
): Promise<{ files: PullRequestFileInfo[] } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    return { files: await listPullRequestFiles(parsed.owner, parsed.repo, prNumber) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the pull request's files." };
  }
}

/** Submit a review on a pull request (approve or request changes). */
export async function reviewPullRequestAction(
  repoRef: string,
  prNumber: number,
  event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
  body?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    if (event !== "APPROVE" && !body?.trim()) {
      return { error: "Add a comment explaining the requested changes." };
    }
    await reviewPullRequest(parsed.owner, parsed.repo, prNumber, event, body);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not submit the review." };
  }
}

export async function listWorkflowRunsAction(
  repoRef: string,
  branch?: string,
  opts?: { status?: string; workflowId?: number }
): Promise<{ runs: WorkflowRunInfo[] } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const runs = await listWorkflowRuns(parsed.owner, parsed.repo, {
      branch: branch?.trim() || undefined,
      status: opts?.status,
      workflowId: opts?.workflowId,
    });
    return { runs };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list workflow runs." };
  }
}

export async function listRunJobsAction(repoRef: string, runId: number): Promise<{ jobs: WorkflowJobInfo[] } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const jobs = await listRunJobs(parsed.owner, parsed.repo, runId);
    return { jobs };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list workflow jobs." };
  }
}

export async function rerunWorkflowRunAction(repoRef: string, runId: number): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await rerunWorkflowRun(parsed.owner, parsed.repo, runId);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not rerun the workflow." };
  }
}

export async function findPracticeProblemsAction(
  topic: string,
  limit = 3
): Promise<{ problems: PracticeProblemEntry[] } | { error: string }> {
  try {
    await requireOwner();
    if (!topic.trim()) return { error: "Provide a topic." };
    const problems = await findPracticeProblems(topic.trim(), limit);
    return { problems };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not find practice problems." };
  }
}

export async function researchTopicAction(
  topic: string,
  limit = 5
): Promise<{ results: ResearchResult[] } | { error: string }> {
  try {
    await requireOwner();
    if (!topic.trim()) return { error: "Provide a topic." };
    const results = await research(topic.trim(), { limit });
    return { results };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not research the topic." };
  }
}

export async function cancelWorkflowRunAction(repoRef: string, runId: number): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await cancelWorkflowRun(parsed.owner, parsed.repo, runId);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not cancel the workflow." };
  }
}

export async function rerunFailedJobsAction(repoRef: string, runId: number): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await rerunFailedJobs(parsed.owner, parsed.repo, runId);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not re-run the failed jobs." };
  }
}

export async function setWorkflowEnabledAction(repoRef: string, workflowId: number, enabled: boolean): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await setWorkflowEnabled(parsed.owner, parsed.repo, workflowId, enabled);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the workflow." };
  }
}

export async function listRunArtifactsAction(repoRef: string, runId: number): Promise<{ artifacts: ArtifactInfo[] } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    return { artifacts: await listRunArtifacts(parsed.owner, parsed.repo, runId) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list artifacts." };
  }
}

export async function getArtifactDownloadUrlAction(repoRef: string, artifactId: number): Promise<{ url: string } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    return { url: await getArtifactDownloadUrl(parsed.owner, parsed.repo, artifactId) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not get the artifact download link." };
  }
}

export async function getRunLogsDownloadUrlAction(repoRef: string, runId: number): Promise<{ url: string } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    return { url: await getRunLogsDownloadUrl(parsed.owner, parsed.repo, runId) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not get the logs download link." };
  }
}

export async function listPendingDeploymentsAction(repoRef: string, runId: number): Promise<{ deployments: PendingDeployment[] } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    return { deployments: await listPendingDeployments(parsed.owner, parsed.repo, runId) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list pending deployments." };
  }
}

export async function reviewPendingDeploymentsAction(
  repoRef: string,
  runId: number,
  environmentIds: number[],
  state: "approved" | "rejected",
  comment: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await reviewPendingDeployments(parsed.owner, parsed.repo, runId, environmentIds, state, comment);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not submit the deployment review." };
  }
}

export async function getRepoTreeAction(repoRef: string, ref?: string): Promise<{ tree: RepoTreeEntry[] } | { error: string }> {
  try {
    await requireOwner();
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const tree = await getRepoTree(parsed.owner, parsed.repo, ref?.trim());
    return { tree };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read the repository tree." };
  }
}

export async function getFileTextAction(repoRef: string, path: string, ref?: string): Promise<{ content: string } | { error: string }> {
  try {
    await requireOwner();
    if (!path.trim()) return { error: "Enter a file path." };
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    const content = await getFileText(parsed.owner, parsed.repo, path.trim(), ref?.trim());
    return { content };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read the file." };
  }
}

export async function commitFileAction(repoRef: string, path: string, content: string, message: string, branch: string): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    if (!path.trim()) return { error: "Enter a file path." };
    if (!message.trim()) return { error: "Enter a commit message." };
    const parsed = parseRepoRef(repoRef);
    if (!parsed) return { error: "Enter a repository as owner/name or a github.com URL." };
    await putFile(parsed.owner, parsed.repo, path.trim(), content, message.trim(), branch.trim() || undefined);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not commit the file." };
  }
}

// ── Knowledge curation ───────────────────────────────────────────────────────

/** Unverified research-loop entries awaiting the owner's review, newest first. */
export async function listUnverifiedKnowledgeAction(): Promise<
  { entries: KnowledgeRow[] } | { error: string }
> {
  try {
    await requireOwner();
    const entries = await listUnverifiedKnowledge(100);
    if (entries === null) {
      return { error: "The knowledge database isn't configured. Set the Supabase env vars and apply the migrations." };
    }
    return { entries };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load knowledge entries." };
  }
}

/**
 * Review one learned knowledge entry: verify (promote toward deck-grade,
 * applying the reviewer's edits) or discard it.
 */
export async function reviewKnowledgeEntryAction(
  id: string,
  decision: "verify" | "discard",
  edits?: { lesson?: string; organization?: string; year?: number }
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const ok =
      decision === "verify" ? await verifyKnowledgeEntry(id, edits ?? {}) : await deleteKnowledgeEntry(id);
    return ok ? { ok: true } : { error: "The update didn't apply. Check the knowledge database configuration." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not review the entry." };
  }
}

export async function findCaseStudyMaterialAction(
  topic: string
): Promise<{ material: CaseStudyMaterial | null } | { error: string }> {
  try {
    await requireOwner();
    if (!topic.trim()) return { error: "Provide a topic." };
    const material = await findCaseStudyMaterial(topic.trim());
    return { material };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not find a case study." };
  }
}

/**
 * Generate a class opener (case study + warm-up exercise) for a week.
 * For the embedded provider, builds deterministically from supplied materials.
 * For other providers, calls the LLM.
 */
export async function generateClassOpenerAction(
  topic: string,
  summary: string,
  minutes: number,
  caseStudyMaterial: CaseStudyMaterial | null,
  practiceProblems: PracticeProblemEntry[],
  provider: LlmProvider = "gemini"
): Promise<{ title: string; text: string } | { error: string }> {
  try {
    await requireOwner();

    const minutesNum = Math.max(5, Math.min(minutes, 120));
    const caseStudyMinutes = Math.round((minutesNum * 0.6) / 5) * 5;
    const warmupMinutes = Math.round((minutesNum * 0.35) / 5) * 5;
    const debriefMinutes = Math.max(5, minutesNum - caseStudyMinutes - warmupMinutes);

    if (provider === "embedded") {
      const title = `Class Opener: ${topic}`;
      const sections: string[] = [
        `# ${title}`,
        "",
        `## Case study discussion (about ${caseStudyMinutes} minutes)`,
      ];

      if (caseStudyMaterial) {
        sections.push(caseStudyMaterial.title);
        sections.push("");
        for (const bullet of caseStudyMaterial.bullets) {
          sections.push(`- ${bullet}`);
        }
        sections.push("");
      } else {
        sections.push(
          `Case Study: ${topic}`,
          "",
          `This case study explores a real-world application of ${topic}. Consider how the principles of ${topic} applied in practice, and what lessons apply to your learning.`,
          ""
        );
      }

      sections.push(
        "Discussion Questions:",
        `1. What key principles of ${topic} were at play in this scenario?`,
        "2. How might this situation have been different with better planning or execution?",
        "3. What would you do differently?",
        "",
        `## Warm-up coding exercise (about ${warmupMinutes} minutes)`,
        ""
      );

      if (practiceProblems.length > 0) {
        const problem = practiceProblems[0];
        sections.push(
          problem.title,
          "",
          problem.prompt,
          ""
        );
        if (problem.exampleCode) {
          sections.push(
            "Example (reference, not the solution):",
            "```",
            problem.exampleCode,
            "```",
            ""
          );
        }
      } else {
        sections.push(
          "Write a short program or function that demonstrates the key concepts of this week.",
          "- Start with a clear problem statement",
          "- Write pseudocode first",
          "- Implement in your chosen language",
          ""
        );
      }

      sections.push(
        `## Debrief (about ${debriefMinutes} minutes)`,
        ""
      );

      if (practiceProblems.length > 0 && practiceProblems[0].solutionCode) {
        sections.push(
          "Solution and key takeaways:",
          "",
          "```",
          practiceProblems[0].solutionCode,
          "```",
          "",
          `Key concepts: The exercise reinforces ${topic} through hands-on practice.`,
          ""
        );
      } else {
        sections.push(
          `Key concepts: Focus on how ${topic} connects theory to real practice.`,
          ""
        );
      }

      return {
        title,
        text: sections.join("\n"),
      };
    }

    const user = await requireOwner();
    const styleBlock = await getWritingStyleBlock(user.id);

    const caseStudyContext = caseStudyMaterial
      ? `Case Study Material:\nTitle: ${caseStudyMaterial.title}\n${caseStudyMaterial.bullets.map((b) => `- ${b}`).join("\n")}`
      : `Topic: ${topic}`;

    const practiceContext =
      practiceProblems.length > 0
        ? `Practice Problem:\n${practiceProblems[0].title}\n${practiceProblems[0].prompt}`
        : `Topic: ${topic}`;

    const llmPrompt = `You are an expert educator creating a class opener (30 minutes max, usually less) combining a case study discussion and warm-up coding exercise.

TOPIC: ${topic}
SUMMARY: ${summary}
TARGET DURATION: ${minutesNum} minutes (split roughly: ${caseStudyMinutes} case study, ${warmupMinutes} warm-up exercise, ${debriefMinutes} debrief)

${caseStudyContext}

${practiceContext}

Write the opener as clean plain text using lightweight markdown:
- The first line is the title: "# Class Opener: [Topic]"
- Use "## Section Name" headings for the three sections: "Case study discussion", "Warm-up coding exercise", "Debrief"
- Include timing hints in the headings like "(about 15 minutes)"
- Use "- " for bullet points and discussion questions
- For code, use triple backticks with a language identifier

Structure:
1. Case study discussion section: briefly ground in the real event/context, explain why it matters for this topic, and include 2-3 discussion questions
2. Warm-up coding exercise: provide a clear task statement, starter code ideas, and hints for an introductory difficulty problem
3. Debrief: provide the exercise solution (if applicable) and key takeaways for the instructor

Requirements:
- Return ONLY the document text. No code fences around the whole output, no commentary, no HTML.
- Be clear, engaging, and professional.
- Do not invent specific facts, dates, or names not in the provided materials.
- Make the exercises doable in the target duration.${styleBlock}`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: llmPrompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 3000 },
      },
      provider
    );

    if (!result.ok) {
      return { error: `Generation failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    let text = result.text.trim();
    const fenced = text.match(/```(?:markdown|md|text)?\s*([\s\S]*?)```/i);
    if (fenced) text = fenced[1].trim();
    if (!text) {
      return { error: "The model returned an empty opener." };
    }

    const titleMatch = text.match(/^# (.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : `Class Opener: ${topic}`;

    return { title, text };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate the class opener." };
  }
}

export async function generateFullCreditChecklistAction(
  instructions: string,
  rubric: string,
  provider: LlmProvider = "gemini"
): Promise<{ checklist: string } | { error: string }> {
  try {
    await requireOwner();
    if (!instructions.trim()) return { error: "Provide the assignment instructions." };
    const items = await synthesizeFullCreditChecklist(instructions, rubric, provider);
    const checklist = items.join("\n");
    return { checklist };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate the checklist." };
  }
}

export async function rememberRubricAction(
  rubric: string,
  topic: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    if (!rubric.trim() || !topic.trim()) return { error: "Provide a rubric and a topic." };
    void rememberRubric(topic, rubric);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not bank the rubric." };
  }
}

export async function findBankedRubricAction(
  topic: string
): Promise<{ rubric: string; matched: boolean } | { error: string }> {
  try {
    await requireOwner();
    if (!topic.trim()) return { error: "Provide a topic." };
    const found = await findRubricForTopic(topic);
    return { rubric: found ?? "", matched: found != null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not look up a banked rubric." };
  }
}

export async function measureKnowledgeGapAction(
  topic: string
): Promise<{ report: CoverageReport } | { error: string }> {
  try {
    await requireOwner();
    if (!topic.trim()) return { error: "Provide a topic." };
    const report = await measureCoverage(topic.trim());
    return { report };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not measure coverage." };
  }
}

export async function runResearchLoopAction(
  topic: string
): Promise<{ report: ResearchLoopReport } | { error: string }> {
  try {
    await requireOwner();
    if (!topic.trim()) return { error: "Provide a topic." };
    const before = await measureCoverage(topic.trim());
    const report = await runResearchLoop(topic.trim(), before);
    return { report };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not run the research loop." };
  }
}

export async function checkBrokenLinksAction(
  courseUrl: string,
  acronym?: string,
  kickoff = false
): Promise<{ state: string; links: BrokenLink[] } | { error: string }> {
  try {
    await requireOwner();
    if (kickoff) { await startLinkValidation(courseUrl, acronym); }
    const result = await getLinkValidation(courseUrl, acronym);
    return result;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not check links." };
  }
}

/** Count workflow deliverable files saved since a given ISO timestamp. */
export async function countWorkflowDeliverablesSince(sinceIso: string): Promise<{ count: number }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const { count } = await supabase
      .from("recording_files")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("origin", "unattended")
      .gt("created_at", sinceIso);

    return { count: count ?? 0 };
  } catch {
    return { count: 0 };
  }
}

/** Count of the owner's PENDING grading drafts (total, not since a time) -
 * powers the Drafts nav-tab badge. Defensive: any failure returns 0. */
export async function countPendingGradingDrafts(): Promise<{ count: number }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const { count } = await supabase
      .from("grading_drafts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "pending");
    return { count: count ?? 0 };
  } catch {
    return { count: 0 };
  }
}

/** Count of the owner's PENDING grading drafts created since the given ISO
 * timestamp - powers the Grade Drafts nav-tab badge. Defensive: any failure
 * returns 0 so the badge never breaks the nav. */
export async function countGradingDraftsSince(sinceIso: string): Promise<{ count: number }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const { count } = await supabase
      .from("grading_drafts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "pending")
      .gt("created_at", sinceIso);

    return { count: count ?? 0 };
  } catch {
    return { count: 0 };
  }
}

/**
 * Generate a plan of visualizable concepts from a course topic and summary.
 * Provider "embedded" uses a deterministic fallback (split summary into sentences).
 * Otherwise calls the LLM to extract the count most visualizable concepts with
 * animation ideas. Falls back to embedded derivation if LLM returns empty/malformed
 * JSON, never failing due to LLM quality issues.
 */
export async function generateConceptPlanAction(
  topic: string,
  summary: string,
  count: number,
  provider: LlmProvider = "gemini"
): Promise<{ concepts: Array<{ concept: string; visualIdea: string }> } | { error: string }> {
  try {
    await requireOwner();
    const clampedCount = Math.max(1, Math.min(6, count));

    // Embedded Deterministic Engine: split summary into sentences and derive
    // concepts from them (no model call).
    if (provider === "embedded") {
      return { concepts: deriveConceptsFromSummary(topic, summary, clampedCount) };
    }

    const prompt = `You are an educational designer planning animated concept visualizations for a course week.

TOPIC: ${topic.trim()}

SUMMARY:
${summary.trim()}

Extract the ${clampedCount} most visualizable concepts from this week's material. A visualizable concept is one where animation (state changes, flows, comparisons, transformations) shows the idea better than static text alone.

Return ONLY valid JSON (no markdown, no code fence, no extra text):
[
  { "concept": "...", "visualIdea": "..." },
  ...
]

Each object must have:
- "concept": a concise, specific concept name (2-5 words)
- "visualIdea": one concrete animation idea (what visual change/flow/comparison depicts it)

Return exactly ${clampedCount} entries or fewer if fewer exist.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 1024 },
      },
      provider
    );

    if (!result.ok) {
      return { concepts: deriveConceptsFromSummary(topic, summary, clampedCount) };
    }

    const jsonText = result.text.trim();
    const parsed = parseLenientJsonArray(jsonText);

    if (!parsed || parsed.length === 0) {
      return { concepts: deriveConceptsFromSummary(topic, summary, clampedCount) };
    }

    const concepts = parsed
      .slice(0, clampedCount)
      .filter(
        (item): item is { concept: string; visualIdea: string } =>
          typeof item === "object" &&
          item !== null &&
          "concept" in item &&
          "visualIdea" in item &&
          typeof (item as Record<string, unknown>).concept === "string" &&
          typeof (item as Record<string, unknown>).visualIdea === "string"
      )
      .map((item) => ({
        concept: (item.concept as string).trim(),
        visualIdea: (item.visualIdea as string).trim(),
      }))
      .filter((item) => item.concept && item.visualIdea);

    if (concepts.length === 0) {
      return { concepts: deriveConceptsFromSummary(topic, summary, clampedCount) };
    }

    return { concepts };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/**
 * Generate a professional self-contained HTML animation for a single concept.
 * Provider "embedded" returns scaffoldConceptAnimation directly.
 * Otherwise calls the LLM with a strict prompt, validates the result, and retries
 * once with problems appended if validation fails. Falls back to scaffoldConceptAnimation
 * on persistent validation failures, never failing due to LLM output quality.
 */
export async function generateConceptAnimationAction(
  concept: string,
  visualIdea: string,
  context: string,
  provider: LlmProvider = "gemini"
): Promise<{ html: string } | { error: string }> {
  try {
    await requireOwner();

    // Embedded Deterministic Engine: return the fallback animation.
    if (provider === "embedded") {
      return { html: scaffoldConceptAnimation(concept, visualIdea) };
    }

    const basePrompt = `You are an expert in educational animation and data visualization. Create a self-contained HTML fragment (NO doctype, html, head, or body tags) that teaches the following concept visually.

CONCEPT: ${concept}
ANIMATION IDEA: ${visualIdea}
CONTEXT: ${context}

Requirements:
- Produce ONE HTML fragment only (no wrapper tags).
- Use SVG with CSS @keyframes and/or SMIL <animate> elements to create a 12-25 second staged loop.
- The loop should be: Setup (introduce the concept) -> Transformation (show the key change/flow/comparison) -> Result (show the outcome).
- Include on-canvas captions for each stage (text labels within the SVG or adjacent text).
- Include a plain-text legend below the animation explaining the stages.
- Use a muted professional palette (grays with one accent color, e.g., #0066cc).
- Ensure accessible contrast (text on backgrounds must meet WCAG AA).
- NO JavaScript whatsoever.
- NO external images, fonts, or links (data: URIs and internal #ids are fine).
- NO emojis.
- Self-contained: all styles inline or in <style>, all content inline.

Output ONLY the HTML fragment itself.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: basePrompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
      },
      provider
    );

    if (!result.ok) {
      return { html: scaffoldConceptAnimation(concept, visualIdea) };
    }

    let html = stripCodeFences(result.text);
    let validation = validateAnimationHtml(html);

    if (!validation.ok) {
      const correctionPrompt = basePrompt + `

Your previous attempt violated these requirements:
${validation.problems.map((p) => "- " + p).join("\n")}

Fix these issues and try again.`;

      const retryResult = await callLlm(
        {
          contents: [{ role: "user", parts: [{ text: correctionPrompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
        },
        provider
      );

      if (retryResult.ok) {
        html = stripCodeFences(retryResult.text);
        validation = validateAnimationHtml(html);
      }
    }

    if (!validation.ok) {
      return { html: scaffoldConceptAnimation(concept, visualIdea) };
    }

    return { html };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/**
 * Deterministically derive up to count concepts from a summary by splitting
 * into sentences. Returns { concept: first 6 words titled, visualIdea: the sentence }.
 */
function deriveConceptsFromSummary(
  topic: string,
  summary: string,
  count: number
): Array<{ concept: string; visualIdea: string }> {
  const sentences = summary
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return sentences.slice(0, count).map((sentence) => {
    const words = sentence.split(/\s+/).slice(0, 6);
    const concept = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    return {
      concept: concept || topic,
      visualIdea: sentence,
    };
  });
}

// ── Concept visualizer ──────────────────────────────────────────────────────

/**
 * Check if a concept exists on the visualizer.
 * Reads navItems.ts from the visualizer repo and returns the URL if found,
 * or { found: false } if not found.
 */
export async function findVisualizerConceptAction(
  concept: string
): Promise<
  { found: true; url: string; topic: string; slug: string; label: string } |
  { found: false } |
  { error: string }
> {
  try {
    await requireOwner();
    if (!concept.trim()) {
      return { found: false };
    }

    const navItemsContent = await getFileText("alexandergshaw", "programming-concept-visualizer", "components/pageComponents/navItems.ts");
    const entries = parseNavItems(navItemsContent);
    const match = matchConcept(entries, concept);

    if (!match) {
      return { found: false };
    }

    // Find the topic route by reverse-mapping from the export name
    let topicRoute: string | undefined;
    for (const [key, exportName] of Object.entries(TOPIC_TO_EXPORT_MAP)) {
      if (exportName === match.topicExport) {
        topicRoute = TOPIC_ROUTES[key];
        break;
      }
    }
    if (!topicRoute) {
      return { found: false };
    }

    const url = `https://programming-concept-visualizer.vercel.app${topicRoute}?concept=${encodeURIComponent(match.value)}`;
    return {
      found: true,
      url,
      topic: match.topicExport,
      slug: match.value,
      label: match.label,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not find the visualizer concept." };
  }
}

/**
 * Create a new concept page on the visualizer.
 * Generates a React component, commits it to the repo, and updates navItems.ts and the topic page.
 * Returns the URL of the created concept or an error.
 */
export async function createVisualizerConceptAction(
  concept: string,
  context: string = "",
  provider: LlmProvider = "gemini"
): Promise<{ url: string; slug: string; topic: string } | { error: string }> {
  try {
    await requireOwner();

    if (provider === "embedded") {
      return { error: "Creating visualizer pages requires an LLM provider." };
    }

    if (!concept.trim()) {
      return { error: "Enter a concept name." };
    }

    // Pick the best topic for the concept using LLM
    const topicKeys = Object.keys(TOPIC_ROUTES).join(", ");
    const topicPrompt = `Given the concept "${concept}"${context ? ` and context "${context}"` : ""}, choose the BEST category from: ${topicKeys}. Return ONLY the key (no other text).`;

    const topicResult = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: topicPrompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 50 },
      },
      provider
    );

    if (!topicResult.ok) {
      return { error: "Could not determine the best topic for this concept." };
    }

    let topic = topicResult.text.trim().toLowerCase();
    if (!TOPIC_ROUTES[topic]) {
      topic = "programming-basics";
    }

    // Generate the component
    const componentPrompt = `You are a React/TypeScript expert building educational concept visualizations.

Create a React component named "${concept.replace(/[^a-zA-Z0-9]/g, "")}Concept" that teaches "${concept}"${context ? ` with this context: "${context}"` : ""}.

Requirements:
- Export a default function component (no 'use client')
- Import ConceptWrapper, TableOfContents, Section, CalloutBox, CodeSnippet from components/common
- Structure: ConceptWrapper with title/description, wrapping TableOfContents with Sections
- Include at least: a "Big Idea" section with a CalloutBox, a "Code Walkthrough" section with CodeSnippet, and a "Common Mistakes" section
- Use ONLY theme tokens for colors: var(--ink), var(--info), var(--success), var(--warning), var(--danger), or themed MUI props
- NO hardcoded hex colors or emojis
- NO external imports except from components/common
- Valid TypeScript

Return ONLY the complete component code (starting with import statements).`;

    const componentResult = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: componentPrompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
      },
      provider
    );

    if (!componentResult.ok) {
      return { error: "Could not generate the component." };
    }

    let componentCode = componentResult.text.trim();

    // Validate the component (retry once on validation failure)
    let validationAttempt = 0;
    while (validationAttempt < 2) {
      const hasExportDefault = /export\s+default\s+function/.test(componentCode);
      const hasConceptWrapper = /ConceptWrapper/.test(componentCode);
      const hasHexColor = /#[0-9a-fA-F]{3,8}\b/.test(componentCode);

      if (hasExportDefault && hasConceptWrapper && !hasHexColor) {
        // Validation passed
        break;
      }

      validationAttempt++;
      if (validationAttempt < 2) {
        // Retry once
        const retryResult = await callLlm(
          {
            contents: [{ role: "user", parts: [{ text: componentPrompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
          },
          provider
        );

        if (!retryResult.ok) {
          return { error: "Could not regenerate the component after validation failure." };
        }

        componentCode = retryResult.text.trim();
      } else {
        // Both attempts failed
        if (!hasExportDefault || !hasConceptWrapper) {
          return { error: "Generated component is invalid. Missing required structure." };
        }
        if (hasHexColor) {
          return { error: "Generated component contains hardcoded colors. Please regenerate." };
        }
      }
    }

    // Normalize the slug from the concept name
    const slug = concept
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    if (!slug) {
      return { error: "Could not generate a valid slug from the concept name." };
    }

    const componentName = concept.replace(/[^a-zA-Z0-9]/g, "");
    const componentFileName = `${componentName}Concept.tsx`;
    const topicDirName = TOPIC_TO_DIR_MAP[topic];
    if (!topicDirName) {
      return { error: "Unknown topic directory mapping." };
    }

    // Read current navItems and topic page
    const navItemsContent = await getFileText("alexandergshaw", "programming-concept-visualizer", "components/pageComponents/navItems.ts");
    const topicPagePath = `components/pageComponents/${topicDirName}/${topicDirName}Page.tsx`;
    const topicPageContent = await getFileText("alexandergshaw", "programming-concept-visualizer", topicPagePath);

    // Update navItems with the correct export name
    const topicExportName = TOPIC_TO_EXPORT_MAP[topic];
    if (!topicExportName) {
      return { error: "Unknown topic export mapping." };
    }

    const updatedNavItems = insertNavLeaf(navItemsContent, topicExportName, concept, slug);
    if (!updatedNavItems) {
      return { error: "Concept already exists or could not update navItems." };
    }

    // Update topic page
    const updatedTopicPage = insertTopicPageCase(
      topicPageContent,
      `${componentName}Concept`,
      slug,
      `./${componentName}Concept`
    );
    if (!updatedTopicPage) {
      return { error: "Could not update topic page." };
    }

    // Commit three files: component first, topic page second, navItems last
    const componentPath = `components/pageComponents/${topicDirName}/${componentFileName}`;
    await putFile("alexandergshaw", "programming-concept-visualizer", componentPath, componentCode, `feat(concepts): Add ${concept} concept component`);
    await putFile("alexandergshaw", "programming-concept-visualizer", topicPagePath, updatedTopicPage, `feat(concepts): Add ${concept} case to ${topicDirName}Page`);
    await putFile("alexandergshaw", "programming-concept-visualizer", "components/pageComponents/navItems.ts", updatedNavItems, `feat(concepts): Add ${concept} to navigation`);

    const url = `https://programming-concept-visualizer.vercel.app${TOPIC_ROUTES[topic]}?concept=${encodeURIComponent(slug)}`;
    return { url, slug, topic };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the visualizer concept." };
  }
}

/**
 * List all open problems for the user.
 */
export async function listOpenProblemsAction(): Promise<
  { problems: Array<{ id: string; title: string; detail: string }>; count: number } | { error: string }
> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const { listProblems } = await import("@/lib/problems");
    const allProblems = await listProblems(supabase, user.id);
    const openProblems = allProblems.filter((p) => p.status === "open");
    return {
      problems: openProblems.map((p) => ({
        id: p.id,
        title: p.title,
        detail: p.detail,
      })),
      count: openProblems.length,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to list open problems." };
  }
}

/**
 * List all solutions for a specific problem.
 */
export async function listProblemSolutionsAction(
  problemId: string
): Promise<{ solutions: Array<{ title: string; approach: string }> } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const { listSolutionsForProblem } = await import("@/lib/problems");
    const solutions = await listSolutionsForProblem(supabase, user.id, problemId);
    return {
      solutions: solutions.map((s) => ({
        title: s.title,
        approach: s.approach,
      })),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to list solutions." };
  }
}

/**
 * Process all open problems: generate and save solutions for each one.
 */
export async function processProblemSolutionsAction(
  problemsJson: string,
  provider: LlmProvider
): Promise<
  {
    report: string;
    proposedCount: number;
  } | { error: string }
> {
  try {
    await requireOwner();

    let problems: Array<{ id: string; title: string; detail: string }>;
    try {
      problems = JSON.parse(problemsJson);
    } catch {
      return { error: "Problems JSON is invalid." };
    }

    if (!Array.isArray(problems)) {
      return { error: "Problems must be a JSON array." };
    }

    const reportLines: string[] = [];
    let proposedCount = 0;

    for (const problem of problems) {
      try {
        const priorResult = await listProblemSolutionsAction(problem.id);
        const priorSolutions = "error" in priorResult ? [] : priorResult.solutions;

        const result = await proposeProblemSolutionsAction(problem, priorSolutions, provider);

        if ("error" in result) {
          reportLines.push(`${problem.title}: ${result.error}`);
          continue;
        }

        proposedCount += result.solutions.length;
        reportLines.push(`${problem.title}: Proposed ${result.solutions.length} solution(s).`);

        for (const sol of result.solutions) {
          reportLines.push(`  - ${sol.title}`);
          reportLines.push(`    ${sol.approach}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        reportLines.push(`${problem.title}: Failed - ${message}`);
      }
    }

    return {
      report: reportLines.join("\n"),
      proposedCount,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/**
 * Propose 2-3 NEW solutions to an open problem, ensuring they differ from all
 * prior solutions. Inserts solutions via insertSolutions with the service client.
 * Returns solutions or error.
 */
export async function proposeProblemSolutionsAction(
  problem: { id: string; title: string; detail: string },
  priorSolutions: Array<{ title: string; approach: string }>,
  provider: LlmProvider
): Promise<{ solutions: Array<{ title: string; approach: string }> } | { error: string }> {
  try {
    const user = await requireOwner();

    if (provider === "embedded") {
      return { error: "Proposing solutions requires an LLM provider." };
    }

    const priorList = priorSolutions.length > 0
      ? priorSolutions.map(s => `${s.title}\n${s.approach}`).join("\n---\n")
      : "(none)";

    const prompt = `You are helping solve a user's problem. The problem is:

PROBLEM TITLE: ${problem.title}
PROBLEM DETAIL: ${problem.detail || "(no additional detail)"}

The user has already received these solution proposals (by title and approach):
${priorList}

Now propose 2-3 BRAND NEW solutions that are materially different from every prior solution. Each solution must use a different mechanism or angle, not a rewording of existing proposals.

Return ONLY a valid JSON array:
[
  {"title": "Solution Name", "approach": "3-6 sentences describing the concrete, actionable approach."},
  {"title": "Another Solution", "approach": "..."}
]

Ensure each approach is 3-6 sentences, concrete, and actionable.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
      },
      provider
    );

    if (!result.ok) {
      return { error: "Failed to generate solutions." };
    }

    let solutions = parseLenientJsonArray(result.text) as
      | Array<{ title?: string; approach?: string }>
      | null;
    if (!solutions || solutions.length < 2 || solutions.length > 3) {
      solutions = null;
    }

    if (!solutions) {
      const retryPrompt = `${prompt}

Remember: Return ONLY the JSON array with 2-3 solutions, nothing else. Each must be different from every prior solution.`;
      const retryResult = await callLlm(
        {
          contents: [{ role: "user", parts: [{ text: retryPrompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
        },
        provider
      );

      if (!retryResult.ok) {
        return { error: "Failed to generate solutions on retry." };
      }

      solutions = parseLenientJsonArray(retryResult.text) as
        | Array<{ title?: string; approach?: string }>
        | null;
    }

    if (!solutions || solutions.length < 2 || solutions.length > 3) {
      return { error: "Could not generate valid 2-3 solutions." };
    }

    const validated: Array<{ title: string; approach: string }> = [];
    for (const sol of solutions) {
      const title = typeof sol.title === "string" ? sol.title.trim() : "";
      const approach = typeof sol.approach === "string" ? sol.approach.trim() : "";
      if (title && approach) {
        validated.push({ title, approach });
      }
    }

    if (validated.length < 2) {
      return { error: "Generated solutions had empty fields." };
    }

    const supabase = createServiceClient();
    const { insertSolutions } = await import("@/lib/problems");
    await insertSolutions(supabase, user.id, problem.id, validated);

    return { solutions: validated };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/**
 * Strip markdown code fences from text (```...``` or ```language...```).
 */
function stripCodeFences(text: string): string {
  return text.replace(/```[a-z]*\n?/gi, "").trim();
}
