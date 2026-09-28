"use server";

// A39 wave 4c (docs/a39-waves.md 8.4.3): everything the incremental run must
// not do N times, done once, before the pool ever opens. Building this
// ticket list is the SAME ingestion the existing whole-run gradeAction uses
// (extractStudentEntries / buildSingleFileEntry / extractCanvasEntries) -
// this action does not re-implement extraction, it only stops short of ever
// calling the model.
//
// A44's collision refusal (decideCollisionRefusal, called from inside
// extractStudentEntries at extraction.ts:145, strictly before grouping at
// :149) therefore fires HERE, before a single ticket exists, before the
// pool starts, before any grade-run-item fetch is issued - inherited
// automatically, with no extra code (docs/a46-scope.md section 3). W-A46-1
// (this file's own test) proves that executably rather than arguing it from
// source order.
import { requireAppOwner } from "@/lib/supabase/auth";
import { normalizeProvider } from "@/lib/llm";
import { checkFileWireBudget } from "@/lib/upload-budget";
import { classifyGradingUpload, buildSingleFileEntry } from "@/lib/grade/single-file-entry";
import { extractStudentEntries, extractCanvasEntries } from "@/lib/grade/extraction";
import type { StudentSubmissionEntry } from "@/lib/grade/types";
import {
  estimateEntryWireBytes,
  ITEM_REQUEST_BYTE_BUDGET,
  type GradingItemTicket,
  type IncrementalRunPlan,
} from "../components/grading/incrementalRunPlan";

export type PrepareGradingRunResult =
  | { readonly mode: "whole-run"; readonly reason: string }
  | { readonly mode: "refused"; readonly reason: string }
  | { readonly mode: "incremental"; readonly plan: IncrementalRunPlan };

// RULING 118: every refusal message collisionRefusal.ts's buildRefusalMessage
// emits starts with this exact prefix (collisionRefusal.ts:128,
// `` `Refused: ${group.paths.length} files...` ``) - the only textual signal
// available here, since extraction.ts (out of this ticket's write set) throws
// a plain Error rather than a dedicated error class. Used ONLY to route a
// refusal to its own `mode` below; the refusal's own wording and conditions
// are untouched (collisionRefusal.ts is not in this write set either).
const REFUSAL_MESSAGE_PREFIX = "Refused: ";

/**
 * Builds the ticket list for the incremental pool, or hands back a reason to
 * fall back to the existing whole-run Server Action. Never calls a model:
 * this function only extracts already-in-hand submissions into entries and
 * checks their size, exactly the work gradeAction already does before its
 * first gradeEntries/gradeSubmissions call - just done ONCE, up front,
 * rather than implicitly re-derivable per item.
 *
 * `mode: "whole-run"` is not decoration: two of the states below are
 * knowable ONLY after this action has run server-side and opened the
 * archive (RULING 40) - a caller with no consumer for this branch would
 * start the pool anyway on a run that should never have pooled at all. See
 * useIncrementalGradingRun.ts's `startReview` for the named consumer.
 */
export async function prepareGradingRunAction(formData: FormData): Promise<PrepareGradingRunResult> {
  await requireAppOwner();

  const canvasUrl = ((formData.get("canvasUrl") as string | null) ?? "").trim();
  const assignmentInstructions = (formData.get("assignmentInstructions") as string | null) ?? "";
  const rubric = (formData.get("rubric") as string | null) ?? "";
  const provider = normalizeProvider(formData.get("provider") as string | null);

  try {
    let entries: StudentSubmissionEntry[];
    let pointsPossible: number | null = null;

    if (canvasUrl) {
      const extracted = await extractCanvasEntries(canvasUrl);
      entries = extracted.entries;
      pointsPossible = extracted.pointsPossible;
    } else {
      const file = formData.get("studentSubmissions") as File | null;
      if (!file || file.size === 0) {
        return { mode: "whole-run", reason: "Please upload a student submissions zip file." };
      }
      const zipBudgetCheck = checkFileWireBudget(file.size, "The student submissions zip");
      if (!zipBudgetCheck.ok) {
        return { mode: "whole-run", reason: zipBudgetCheck.error ?? "That zip file is too large to upload." };
      }

      const uploadKind = classifyGradingUpload(file.name);
      if (uploadKind === "single") {
        const entry = await buildSingleFileEntry(file.name, Buffer.from(await file.arrayBuffer()));
        entries = entry ? [entry] : [];
      } else {
        // A44's collision refusal throws from inside this call, strictly
        // before any ticket is built - see this file's own header comment.
        entries = await extractStudentEntries(await file.arrayBuffer());
      }
    }

    if (entries.length === 0) {
      return { mode: "whole-run", reason: "Nothing to grade was found in the upload." };
    }

    // W4-12 clause 2: ANY single entry over the per-item wire budget routes
    // the WHOLE run to the existing whole-run path, never a partial
    // incremental run that silently drops the oversized item and reports
    // complete anyway. The whole-run path never re-uploads an extracted
    // entry - it grades server-side from the archive already in the request
    // - so it is the correct sink for an entry too large for a per-item
    // Route Handler call.
    for (const entry of entries) {
      if (estimateEntryWireBytes(entry) > ITEM_REQUEST_BYTE_BUDGET) {
        return { mode: "whole-run", reason: "One submission is too large to grade incrementally." };
      }
    }

    const tickets: GradingItemTicket[] = entries.map((entry, sourceIndex) => ({ sourceIndex, entry }));
    return {
      mode: "incremental",
      plan: { tickets, assignmentInstructions, rubric, provider, pointsPossible },
    };
  } catch (err) {
    // Includes A44's collision refusal (decideCollisionRefusal, thrown from
    // inside extractStudentEntries - see this file's header comment). RULING
    // 118: a refusal is a DECISION the app has already made, not an ordinary
    // extraction failure, so it must not fall back into `mode: "whole-run"` -
    // that branch's only consumer (useIncrementalGradingRun.ts's startReview)
    // answers it by calling the existing whole-run gradeAction, which pays
    // for generateRubric/synthesizeFullCreditChecklist/generateSampleAnswer
    // in the same Promise.all as the (again-)throwing gradeSubmissions call,
    // already dispatched and not cancelled by that second rejection - the
    // exact spend this refusal exists to prevent. `mode: "refused"` is a
    // dead end: its own consumer surfaces the reason and starts nothing.
    //
    // Every other error caught here (a Canvas fetch failure, a malformed
    // single-file upload, ...) is an ORDINARY error, not a refusal, and still
    // falls back to `mode: "whole-run"` exactly as before - the whole-run
    // path's own extraction hits the same error and reports it via
    // gradeAction's existing try/catch, so no information is lost there.
    const message = err instanceof Error ? err.message : "Could not prepare this run.";
    if (message.startsWith(REFUSAL_MESSAGE_PREFIX)) {
      return { mode: "refused", reason: message };
    }
    return { mode: "whole-run", reason: message };
  }
}
