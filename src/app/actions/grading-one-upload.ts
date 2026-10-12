"use server";

// N15a Wave 1 (docs/n15-one-upload-per-student-scope.md section 3): builds the
// ONE gradable entry a single upload represents, and hands the client the
// server-only inter-request delay so its serial queue can pace the grade
// calls (GRADE_INTER_REQUEST_DELAY_MS is not NEXT_PUBLIC; engine.ts:374 reads
// it server-side). It never grades anything itself: the grade call is the
// existing owner-gated, budget-checked POST /api/grade-run-item, dispatched by
// useOneUploadRun.ts one upload at a time.
//
// Reuses classifyGradingUpload + buildSingleFileEntry exactly as
// grading-incremental.ts:123-129 does. The image branch of
// buildSingleFileEntry makes no model call; a text document with an unusable
// file name may make one name-inference call, which sits inside this upload's
// own serial turn (the client awaits this action before it enqueues).
import { requireAppOwner } from "@/lib/supabase/auth";
import { normalizeProvider } from "@/lib/llm";
import { getGeminiInterRequestDelayMs } from "@/lib/gemini";
import { checkFileWireBudget } from "@/lib/upload-budget";
import { classifyGradingUpload, buildSingleFileEntry } from "@/lib/grade/single-file-entry";
import { VIDEO_BATCH_MESSAGE, assertNeverUploadKind } from "@/lib/grade/video-grading";
import {
  estimateEntryWireBytes,
  ITEM_REQUEST_BYTE_BUDGET,
} from "../components/grading/incrementalRunPlan";
import type { OneUploadBuildResult } from "../components/grading/oneUploadQueue";

export async function gradingOneUploadAction(formData: FormData): Promise<OneUploadBuildResult> {
  await requireAppOwner();

  const assignmentInstructions = (formData.get("assignmentInstructions") as string | null) ?? "";
  const provider = normalizeProvider(formData.get("provider") as string | null);

  // Byte-identical to prepareGradingRunAction's blank-instructions refusal
  // (grading-incremental.ts:93): the per-item route has no such refusal of its
  // own (RULING 116), so it is made here, before any upload is accepted.
  if (!assignmentInstructions.trim()) {
    return { ok: false, reason: "Please provide assignment instructions." };
  }

  const file = formData.get("upload") as File | null;
  if (!file || file.size === 0) {
    return { ok: false, reason: "Please choose a file to upload." };
  }

  const budget = checkFileWireBudget(file.size, "The student submission file");
  if (!budget.ok) {
    return { ok: false, reason: budget.error ?? "That file is too large to upload." };
  }

  const kind = classifyGradingUpload(file.name);
  if (kind === "video") return { ok: false, reason: VIDEO_BATCH_MESSAGE };
  if (kind === "zip") {
    return {
      ok: false,
      reason: "A zip holds many students. Turn off 'Each upload is one student' to grade a zip, or upload one file per student.",
    };
  }
  if (kind === "unsupported") {
    return { ok: false, reason: `${file.name} is not a supported submission file type.` };
  }
  // Exhaustive: only "single" may continue; a new upload kind fails tsc here.
  if (kind !== "single") return assertNeverUploadKind(kind);

  try {
    const entry = await buildSingleFileEntry(file.name, Buffer.from(await file.arrayBuffer()), provider);
    if (!entry) {
      return { ok: false, reason: `Could not read any text from ${file.name}.` };
    }
    if (estimateEntryWireBytes(entry) > ITEM_REQUEST_BYTE_BUDGET) {
      return { ok: false, reason: `${file.name} is too large to grade on its own.` };
    }
    return { ok: true, entry, interRequestDelayMs: getGeminiInterRequestDelayMs() };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Could not prepare this upload." };
  }
}
