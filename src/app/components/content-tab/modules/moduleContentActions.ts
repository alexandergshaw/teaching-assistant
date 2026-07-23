import { buildDocxFromPlainText } from "@/lib/docx";
import { buildSlidesPptx } from "@/lib/pptx";
import { resolveDocumentAuthor } from "@/lib/author";
import type { GradableKind } from "@/lib/canvas-modules";
import {
  bulkAssociateRubricAction,
  createGradableAction,
  createModuleItemAction,
  createPageAction,
  createQuizQuestionAction,
} from "../../../actions";
import type { EditableQuestion } from "../types";
import { quizQuestionToInput, textToSlides, uploadFileToModule } from "../utils";

// Create one new item of `type` named `name` and add it to `moduleId`. Pages
// and gradables are created first (to get a slug / content id) and then linked;
// a SubHeader is just a titled module item with no underlying content.
export async function addContentToModule(
  courseUrl: string,
  acronym: string | undefined,
  type: string,
  moduleId: number,
  name: string,
  opts?: {
    dueAt?: string | null;
    points?: number;
    rubricId?: number;
    description?: string;
    questions?: EditableQuestion[];
    fileId?: number;
    fileContent?: string;
    fileFormat?: "docx" | "pptx";
    submissionType?: string;
  }
): Promise<boolean> {
  try {
    if (type === "SubHeader") {
      const r = await createModuleItemAction(courseUrl, moduleId, { type: "SubHeader", title: name }, acronym);
      return !("error" in r);
    }
    if (type === "File") {
      // AI-generated content is built into a branded .docx or .pptx and uploaded
      // as a new file; otherwise link the chosen existing course file here.
      if (opts?.fileContent && opts.fileContent.trim() !== "") {
        const author = resolveDocumentAuthor();
        if (opts.fileFormat === "pptx") {
          const deck = textToSlides(opts.fileContent);
          const buffer = await buildSlidesPptx({
            presentationTitle: deck.presentationTitle,
            slides: deck.slides,
            author,
          });
          const file = new File([buffer], `${name}.pptx`, {
            type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          });
          await uploadFileToModule(courseUrl, acronym, moduleId, file);
          return true;
        }
        const buffer = await buildDocxFromPlainText(opts.fileContent, undefined, author);
        const file = new File([buffer], `${name}.docx`, {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
        await uploadFileToModule(courseUrl, acronym, moduleId, file);
        return true;
      }
      if (opts?.fileId != null) {
        const r = await createModuleItemAction(courseUrl, moduleId, { type: "File", contentId: opts.fileId }, acronym);
        return !("error" in r);
      }
      return false;
    }
    if (type === "Page") {
      const created = await createPageAction(
        courseUrl,
        { title: name, body: opts?.description || undefined },
        acronym
      );
      if ("error" in created) return false;
      const linked = await createModuleItemAction(courseUrl, moduleId, { type: "Page", pageUrl: created.page.url }, acronym);
      return !("error" in linked);
    }
    // Assignment / Quiz / Discussion: create with the optional details, link it,
    // then attach a rubric (assignments) and questions (quizzes) once it exists.
    const fields: { title: string; description?: string; pointsPossible?: number; dueAt?: string | null; submissionType?: string } = { title: name };
    if (opts?.description) fields.description = opts.description;
    if (opts?.points != null && Number.isFinite(opts.points)) fields.pointsPossible = opts.points;
    if (opts?.dueAt) fields.dueAt = opts.dueAt;
    if (opts?.submissionType && type === "Assignment") fields.submissionType = opts.submissionType;
    const created = await createGradableAction(courseUrl, type as GradableKind, fields, acronym);
    if ("error" in created) return false;
    const linked = await createModuleItemAction(courseUrl, moduleId, { type, contentId: created.id }, acronym);
    if ("error" in linked) return false;
    if (opts?.rubricId != null && type === "Assignment") {
      await bulkAssociateRubricAction(courseUrl, opts.rubricId, [String(created.id)], acronym);
    }
    if (type === "Quiz" && opts?.questions && opts.questions.length > 0) {
      for (const q of opts.questions) {
        await createQuizQuestionAction(courseUrl, created.id, quizQuestionToInput(q), acronym);
      }
    }
    return true;
  } catch {
    return false;
  }
}
