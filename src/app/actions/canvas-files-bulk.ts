"use server";

import { createModuleItem, getPage, updatePage, createPage, createCodeFilePage, deletePage, listAddableContent, setDueDates, requestFileUpload, listCourseFiles, renameCourseFile, deleteCourseFile, createCourseCopy, getMigrationState, selectCopyTypes, getSelectiveData, submitSelectiveImport, type SelectiveNode, listBulkItems, bulkUpdate, bulkDelete, listRubrics, bulkAssociateRubric, createRubric, getRubric, updateRubric, type RubricDetail, getGradable, updateGradable, createGradable, getFilePreview, listQuizQuestions, createQuizQuestion, updateQuizQuestion, deleteQuizQuestion, type CanvasPage, type CanvasAddableContent, type DueDateUpdate, type FileUploadTicket, type BulkItem, type BulkKind, type CourseFile, type CanvasRubric, type GradableKind, type GradableDetail, type FilePreview, type RubricCriterionInput, type QuizQuestion, type QuizQuestionInput, startLinkValidation, getLinkValidation, type BrokenLink } from "@/lib/canvas-modules";
import { requireOwner } from "@/lib/supabase/auth";

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
