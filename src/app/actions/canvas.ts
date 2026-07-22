"use server";

import { deriveAltTextFromHtml, deriveLinkTextFromHtml } from "@/lib/embedded/accessibility";
import { getCourseName, listAnnouncements, createAnnouncement, listConversations, getConversation, replyToConversation, listCourses, listCoursesByTerm, setConversationWorkflowState, listAssignments, listStudents, listCourseRoster, listAssignmentTextSubmissions, listCourseAssignmentDueDates, listAssignmentBriefsWithDue, listStudentGradeSummaries, type CanvasAnnouncement, type CanvasConversationSummary, type CanvasConversationDetail, type CanvasCourse, type CanvasAssignmentBrief, type CanvasPerson, type CanvasRosterEntry, type CanvasTextSubmission } from "@/lib/canvas";
import { resolveInstitution, resolveInstitutionByCode } from "@/lib/canvas-core";
import { listModules, createModule, updateModule, deleteModule, createModuleItem, updateModuleItem, deleteModuleItem, listPages, getPage, updatePage, createPage, createCodeFilePage, deletePage, listAddableContent, setDueDates, requestFileUpload, listCourseFiles, renameCourseFile, deleteCourseFile, createCourseCopy, getMigrationState, selectCopyTypes, getSelectiveData, submitSelectiveImport, type SelectiveNode, listBulkItems, bulkUpdate, bulkDelete, listRubrics, bulkAssociateRubric, createRubric, getRubric, updateRubric, type RubricDetail, getGradable, updateGradable, createGradable, getFilePreview, getOfficeEditable, saveOfficeEdits, listQuizQuestions, createQuizQuestion, updateQuizQuestion, deleteQuizQuestion, type CanvasModule, type CanvasPageSummary, type CanvasPage, type CanvasAddableContent, type NewModuleItem, type DueDateUpdate, type FileUploadTicket, type BulkItem, type BulkKind, type CourseFile, type CanvasRubric, type GradableKind, type GradableDetail, type FilePreview, type RubricCriterionInput, type QuizQuestion, type QuizQuestionInput, getAccessibilityItem, saveAccessibilityItemHtml, getOfficeFileImagesWithData, getOfficeFileImageData, saveOfficeFileImageAlt, getOfficeFileStructure, saveOfficeFileStructure, saveOfficeFileFixes, getPdfMeta, savePdfFixes, uploadFileToModule, appendOfficeParagraph, listScannableFiles, createAssignment, listAssignmentGroups, type NewAssignment, startLinkValidation, getLinkValidation, type BrokenLink } from "@/lib/canvas-modules";
import type { OfficeImage } from "@/lib/office-edit";
import type { OfficeKind, OfficeParagraph, RunSpan } from "@/lib/office-edit";
import { suggestHeadingLevels, titleFromFileName } from "@/lib/doc-headings";
import { buildOfficeIssues } from "@/lib/accessibility/office-issues";
import { type AccessibleItemType, type Issue } from "@/lib/accessibility/types";
import { callLlm, type LlmProvider } from "@/lib/llm";
import { requireOwner } from "@/lib/supabase/auth";


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
