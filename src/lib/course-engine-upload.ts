/**
 * The one shared "does this file fit in the request" check for
 * useLessonPlanner.ts's Manual > Build Courses > Pre Built flow.
 *
 * Both branches of that flow's generate handler post a browser File as
 * base64 inside a Server Action's JSON body: the Course Engine branch (a
 * hosted Vercel deployment reached via generateLectureDeckAction) and the
 * Gemini branch (generateLessonPlanAction / generateAssignmentAction, run by
 * this same Next.js app, also on Vercel). Where either branch extracts text
 * from the file - client or server - has no bearing on this: the file still
 * has to cross the wire first, and Vercel caps a Server Action's request body
 * at ~4.5MB BEFORE any of our code runs (see upload-budget.ts for the
 * platform fact this rests on, including why a base64 payload rides the wire
 * at 4/3 its size on disk). Both branches are equally subject to that cap.
 *
 * Before this module existed, the two branches each carried their own copy
 * of this rule and drifted: the Course Engine branch compared the raw file
 * size directly against the platform's own 4.5MB number - wrong in exactly
 * the way upload-budget.ts's header warns about, and it permitted a ~6MB
 * request - while the Gemini branch had no check at all, in part because of
 * a comment on this file's Course Engine branch that incorrectly claimed the
 * Gemini branch was not subject to this cap. Routing every entry point
 * through this one function means a future third entry point cannot repeat
 * any of those mistakes: it just calls this, and never has to know the byte
 * math itself.
 *
 * This module composes checkFileWireBudget from upload-budget.ts (the actual
 * byte math) with nothing else - no React, no Next.js, no server-only
 * imports - so, like upload-budget.ts itself, it stays safe to import from a
 * client hook or a client component alike.
 */
import { checkFileWireBudget, type UploadBudgetCheck } from "./upload-budget";

/**
 * Refuses a file (or, for a caller checking several files that share one
 * request body, their combined byte count) that would not fit the shared
 * upload wire budget. `fileBytes` is the raw `File.size` or file-size total
 * (this function does the WIRE conversion internally, so callers never
 * compare the wrong unit). `what` names the thing being refused for the
 * user-facing message, e.g. `"lecture.pptx"`, `"This course repository"`, or
 * `"These attached files"`.
 */
export function checkCourseEngineUpload(fileBytes: number, what: string): UploadBudgetCheck {
  return checkFileWireBudget(fileBytes, what);
}
