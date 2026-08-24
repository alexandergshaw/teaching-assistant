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

type AddContentOpts = {
  dueAt?: string | null;
  points?: number;
  rubricId?: number;
  description?: string;
  questions?: EditableQuestion[];
  fileId?: number;
  fileContent?: string;
  fileFormat?: "docx" | "pptx";
  submissionType?: string;
  // Item order and nesting within the module (G4 / D10). Both are genuinely
  // optional: when absent, no module_item[position] / module_item[indent]
  // parameter is sent at all (module-items.ts's createModuleItem guards each
  // with `typeof x === "number"`), so Canvas falls back to its own default
  // (append to the end, no indent) exactly as every pre-existing caller of
  // addContentToModule/addContentToModuleDetailed already relies on. Do NOT
  // default either to 0 or 1 here - a wrong default would silently reorder
  // every existing caller's module on every add.
  position?: number;
  indent?: number;
};

// Outcome of one addContentToModuleDetailed attempt. A plain discriminated
// union (no new dependency) instead of a boolean, so a caller that wants to
// react to a *partial* failure precisely can:
//   - "success": the item was created (where applicable) and is linked into
//     the module.
//   - "failed": nothing was created in Canvas; there is nothing to clean up
//     or report.
//   - "orphaned": the underlying content (assignment/quiz/discussion/page)
//     WAS created in Canvas, but linking it into the module failed. Carries
//     enough identity (kind, title, and the new content id when known) for a
//     human to find it in Canvas and decide what to do with it.
//
// Deliberately NOT auto-deleted on "orphaned": rolling back a partial
// failure by deleting the object we just created would be a second,
// unattended destructive write stacked on top of the first failure - the
// delete can itself fail (leaving an even more confusing, undocumented
// state), and it throws away real content (an assignment/quiz/discussion/
// page the instructor asked for, minus only the module link) with no chance
// for a human to reconsider. Surfacing the orphan's identity so a human can
// find and decide what to do with it in Canvas is honest and reversible;
// silently deleting it is not.
export type ModuleContentResult =
  | { status: "success" }
  | { status: "failed" }
  | {
      status: "orphaned";
      kind: string;
      title: string;
      contentId?: number | string;
      detail?: string;
    };

// Create one new item of `type` named `name` and add it to `moduleId`. Pages
// and gradables are created first (to get a slug / content id) and then linked;
// a SubHeader is just a titled module item with no underlying content.
//
// This is a thin boolean-returning wrapper around addContentToModuleDetailed
// below, kept so the two existing callers keep working unchanged:
// useBulkModuleActions.ts's bulkAddToModules does
// `const ok = await addContentToModule(...); if (ok) added++; else failed++;`
// and useAddModuleItem.ts checks `if (!ok)`. Both rely on plain JS
// truthiness, and a discriminated-union *object* is always truthy regardless
// of its contents (`if ({status:"failed"})` is true) - returning the richer
// result directly from this exported name would silently turn every outcome,
// including outright failures and orphans, into a counted "success". Use
// addContentToModuleDetailed directly to get the real outcome.
export async function addContentToModule(
  courseUrl: string,
  acronym: string | undefined,
  type: string,
  moduleId: number,
  name: string,
  opts?: AddContentOpts
): Promise<boolean> {
  const result = await addContentToModuleDetailed(courseUrl, acronym, type, moduleId, name, opts);
  return result.status === "success";
}

// Same operation as addContentToModule, but reports the full outcome -
// including an "orphaned" identity when the content was created but the
// module link failed - instead of collapsing everything to a boolean.
export async function addContentToModuleDetailed(
  courseUrl: string,
  acronym: string | undefined,
  type: string,
  moduleId: number,
  name: string,
  opts?: AddContentOpts
): Promise<ModuleContentResult> {
  try {
    if (type === "SubHeader") {
      // No separate create step - the module item itself IS the content, so
      // a failure here has nothing left over to orphan.
      const r = await createModuleItemAction(
        courseUrl,
        moduleId,
        { type: "SubHeader", title: name, position: opts?.position, indent: opts?.indent },
        acronym
      );
      return "error" in r ? { status: "failed" } : { status: "success" };
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
          // uploadFileToModule (../utils) has the identical create-then-link
          // seam internally (pre-signed upload, then attach-to-module), but
          // on failure it only ever throws a plain Error string - it does
          // not expose the uploaded file's id, so a genuine "orphaned"
          // report with identity cannot be built from out here without
          // changing that function's contract (out of this file's
          // ownership; see the report for what that follow-up would need).
          await uploadFileToModule(courseUrl, acronym, moduleId, file);
          return { status: "success" };
        }
        const buffer = await buildDocxFromPlainText(opts.fileContent, undefined, author);
        const file = new File([buffer], `${name}.docx`, {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
        await uploadFileToModule(courseUrl, acronym, moduleId, file);
        return { status: "success" };
      }
      if (opts?.fileId != null) {
        // Linking an EXISTING file - nothing new is created here, so a
        // failure has nothing to orphan either.
        //
        // C4 fix: `title` MUST be sent here. Every other branch below either
        // has no separate content object (SubHeader) or created that object
        // itself with `title: name` (Page/Assignment/Quiz/Discussion), so
        // Canvas's own "module item defaults to the title of the item it
        // references" behavior already yields `name`. An EXISTING file is
        // the one case where the referenced object's own name predates this
        // call and has nothing to do with `name` - omitting `title` let
        // Canvas name the module item after the FILE instead. The plan's
        // skip check (AC8) compares the resolved title against module ITEM
        // titles, so a re-run never matched and linked the same file again
        // on every apply, once per run, forever - Canvas has no undo for
        // that link.
        const r = await createModuleItemAction(
          courseUrl,
          moduleId,
          { type: "File", contentId: opts.fileId, title: name, position: opts?.position, indent: opts?.indent },
          acronym
        );
        return "error" in r ? { status: "failed" } : { status: "success" };
      }
      return { status: "failed" };
    }
    if (type === "Page") {
      const created = await createPageAction(
        courseUrl,
        { title: name, body: opts?.description || undefined },
        acronym
      );
      if ("error" in created) return { status: "failed" };
      // No `title` here - checked as part of C4 and deliberately left out.
      // The page was just created above with `title: name`, and Canvas
      // titles a Page module item after the page it references when no
      // title is supplied (the same convention every other Page-linking
      // call site in this codebase relies on - see
      // src/lib/lms-generation/commit-execute.ts:163 and its siblings).
      // Unlike the File-link branch above, there is no pre-existing object
      // whose own name could disagree with `name`.
      const linked = await createModuleItemAction(
        courseUrl,
        moduleId,
        { type: "Page", pageUrl: created.page.url, position: opts?.position, indent: opts?.indent },
        acronym
      );
      if ("error" in linked) {
        return { status: "orphaned", kind: "Page", title: name, contentId: created.page.pageId };
      }
      return { status: "success" };
    }
    // Assignment / Quiz / Discussion: create with the optional details, link it,
    // then attach a rubric (assignments) and questions (quizzes) once it exists.
    const fields: { title: string; description?: string; pointsPossible?: number; dueAt?: string | null; submissionType?: string } = { title: name };
    if (opts?.description) fields.description = opts.description;
    if (opts?.points != null && Number.isFinite(opts.points)) fields.pointsPossible = opts.points;
    if (opts?.dueAt) fields.dueAt = opts.dueAt;
    if (opts?.submissionType && type === "Assignment") fields.submissionType = opts.submissionType;
    const created = await createGradableAction(courseUrl, type as GradableKind, fields, acronym);
    if ("error" in created) return { status: "failed" };
    // No `title` here either, for the same reason as the Page branch above:
    // `fields.title = name` was already sent when the assignment/quiz/
    // discussion was created, so Canvas's own object already has the right
    // name and the module item inherits it. Checked as part of C4.
    const linked = await createModuleItemAction(
      courseUrl,
      moduleId,
      { type, contentId: created.id, position: opts?.position, indent: opts?.indent },
      acronym
    );
    if ("error" in linked) {
      return { status: "orphaned", kind: type, title: name, contentId: created.id };
    }
    if (opts?.rubricId != null && type === "Assignment") {
      await bulkAssociateRubricAction(courseUrl, opts.rubricId, [String(created.id)], acronym);
    }
    if (type === "Quiz" && opts?.questions && opts.questions.length > 0) {
      for (const q of opts.questions) {
        await createQuizQuestionAction(courseUrl, created.id, quizQuestionToInput(q), acronym);
      }
    }
    return { status: "success" };
  } catch {
    // Unknown failure point (including a thrown Error from uploadFileToModule
    // after it may have already created a Canvas file) - conservatively
    // treated as "nothing to report", matching the previous blanket-catch
    // behavior, rather than guessing "orphaned" without any identity to back
    // it up.
    return { status: "failed" };
  }
}
