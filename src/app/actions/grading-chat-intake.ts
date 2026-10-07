"use server";

// GRADING-CHAT wave 1 (docs/grading-chat-waves.md section 3, N2). Splits the
// batch surface's fused prepareGradingRunAction into its two per-submission
// halves the chat surface needs: per-run header resolution (once,
// resolveChatRunHeaderAction) and per-submission-event extraction (repeated,
// prepareChatSubmissionAction). Reuses every extractor/classifier the batch
// path already uses; introduces no new ingestion primitive except the thin
// GitHub-repo mapper (buildRepoUrlEntry, module-private) architecture section
// 3.6 calls for.
//
// Both exports call requireAppOwner() as their first statement (matching
// prepareGradingRunAction, grading-incremental.ts:80, and the already-
// tightened /api/grade-run-item route this surface dispatches to).
import { requireAppOwner } from "@/lib/supabase/auth";
import { normalizeProvider } from "@/lib/llm";
import type { LlmProvider } from "@/lib/llm";
import { checkFileWireBudget } from "@/lib/upload-budget";
import { getFileExtension } from "@/lib/office-extract";
import { classifyGradingUpload, buildSingleFileEntry } from "@/lib/grade/single-file-entry";
import { extractStudentEntries, extractCanvasEntries } from "@/lib/grade/extraction";
import { fetchGradableRepoContent, type GradableRepoContent } from "@/lib/grade/repo-content";
import { parseSubmissionGithubUrl } from "@/lib/submission-repo";
import { detectCanvasUrlKind } from "@/lib/canvas-url";
import { parseGoogleDriveUrl } from "@/lib/google-drive-url";
import { fetchGoogleDriveFile } from "@/lib/grade/google-drive-content";
import { resolveRunHeader } from "@/lib/grade/run-header";
import type { GradingRunHeader, StudentSubmissionEntry } from "@/lib/grade/types";
import { estimateEntryWireBytes, ITEM_REQUEST_BYTE_BUDGET } from "@/app/components/grading/incrementalRunPlan";
import { buildTextEntry } from "@/app/components/grading-chat/chatSubmissionIntake";
import type { IntakeOutcome } from "@/app/components/grading-chat/chatSubmissionIntake";

// SEC-GC-3 (docs/grading-chat-security.md F4 Gap 1): bound before a
// generateRubric model call is ever spent, at the same figures route.ts
// already enforces at the per-item dispatch boundary (MAX_INSTRUCTIONS_CHARS
// / MAX_RUBRIC_CHARS, src/app/api/grade-run-item/route.ts:53-54) - so the two
// thresholds this repo already has for these fields do not silently disagree
// with a header-resolution path that had none.
const MAX_INSTRUCTIONS_CHARS = 20_000;
const MAX_RUBRIC_CHARS = 20_000;

// Google Drive link refusals (docs/grading-chat-gdrive-url-scope.md section 4).
const DRIVE_FOLDER_MESSAGE =
  "This is a Google Drive folder, which is not supported yet. Open the folder and share a single file's link, or download the files and drop them in.";
const DRIVE_SHEETS_SLIDES_MESSAGE =
  "Google Sheets and Slides links are not supported yet. Share a Google Doc, or export the file and drop it in.";
const DRIVE_UNSUPPORTED_TYPE_MESSAGE =
  "This file type is not supported for grading. Download it and drop in a text file, document, image, or zip archive.";

/**
 * Resolves the per-RUN header ONCE: the blank-instructions refusal, the
 * effective (possibly synthesized) rubric, and its criteria names. R2
 * (recommended reading, docs/grading-chat-architecture.md section 4):
 * synthesize a rubric from the instructions when the rubric panel is blank,
 * matching the zip path's own `synthesizeRubricWhenBlank: true`.
 */
export async function resolveChatRunHeaderAction(
  assignmentInstructions: string,
  rubric: string,
  provider: LlmProvider
): Promise<GradingRunHeader> {
  await requireAppOwner();

  if (assignmentInstructions.length > MAX_INSTRUCTIONS_CHARS) {
    return {
      kind: "refused",
      error: `Assignment instructions are too long (limit ${MAX_INSTRUCTIONS_CHARS} characters).`,
    };
  }
  if (rubric.length > MAX_RUBRIC_CHARS) {
    return { kind: "refused", error: `Rubric text is too long (limit ${MAX_RUBRIC_CHARS} characters).` };
  }

  return resolveRunHeader(assignmentInstructions, rubric, normalizeProvider(provider), {
    synthesizeRubricWhenBlank: true,
  });
}

/**
 * R3 (built, docs/grading-chat-architecture.md section 3.6): maps
 * `fetchGradableRepoContent`'s flattened output onto the one
 * StudentSubmissionEntry shape the route grades, the same orchestration-over-
 * an-existing-primitive repo-content.ts's own header comment describes for
 * itself. Module-private - its only caller is this file's `prepareChatSubmissionAction`.
 */
function buildRepoUrlEntry(repo: GradableRepoContent): StudentSubmissionEntry {
  return {
    student: repo.repo,
    content: repo.content,
    mergedFileCount: repo.fileCount,
    submittedFiles: repo.files.map((file) => ({
      name: file.path,
      extension: getFileExtension(file.path),
      previewContent: file.text,
      previewTruncated: file.truncated ?? false,
      mimeType: "text/plain",
    })),
    gradedRepo: repo.repo,
    gradedRef: repo.ref,
  };
}

/** Refuses any entry whose estimated wire size exceeds the per-item budget -
 * this surface has no whole-run fallback to route an oversized entry to
 * (do-not-reuse, architecture section 6), so it is a plain refusal. */
function firstOversizedEntryReason(entries: readonly StudentSubmissionEntry[]): string | null {
  for (const entry of entries) {
    if (estimateEntryWireBytes(entry) > ITEM_REQUEST_BYTE_BUDGET) {
      return "One submission is too large to grade on this surface.";
    }
  }
  return null;
}

/**
 * Resolves ONE submission event into gradable entries, or a named refusal.
 * FormData carries a `kind` discriminator ("text" | "file" | "url") plus the
 * matching payload field (`content`/`label`, `file`, or `url`) and `provider`.
 *
 * Text is expected to be built client-side via `buildTextEntry` (N1) on the
 * fast path (architecture section 3.4) - this action still accepts `kind:
 * "text"` for completeness/testability, so the one seam has a single owner.
 */
export async function prepareChatSubmissionAction(formData: FormData): Promise<IntakeOutcome> {
  await requireAppOwner();

  const kind = (formData.get("kind") as string | null) ?? "";
  const provider = normalizeProvider(formData.get("provider") as string | null);

  if (kind === "text") {
    const content = (formData.get("content") as string | null) ?? "";
    const label = (formData.get("label") as string | null) ?? undefined;
    const ordinal = Number(formData.get("ordinal") ?? "1");
    const entry = buildTextEntry({ label, content }, Number.isFinite(ordinal) ? ordinal : 1);
    const oversized = firstOversizedEntryReason([entry]);
    if (oversized) return { kind: "refused", reason: oversized };
    return { kind: "entries", entries: [entry], pointsPossible: null };
  }

  if (kind === "file") {
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) {
      return { kind: "refused", reason: "No file was attached." };
    }
    const budgetCheck = checkFileWireBudget(file.size, "This file");
    if (!budgetCheck.ok) {
      return { kind: "refused", reason: budgetCheck.error ?? "This file is too large to upload." };
    }

    const uploadKind = classifyGradingUpload(file.name);
    if (uploadKind === "unsupported") {
      return {
        kind: "refused",
        reason: "This file type isn't supported for grading. Upload a text file, document, image, or a zip archive.",
      };
    }

    try {
      let entries: StudentSubmissionEntry[];
      if (uploadKind === "single") {
        const entry = await buildSingleFileEntry(file.name, Buffer.from(await file.arrayBuffer()));
        if (!entry) {
          return { kind: "refused", reason: "This file could not be read." };
        }
        entries = [entry];
      } else {
        // A44's collision refusal throws from inside extractStudentEntries,
        // before any ticket exists - caught below, surfaced verbatim (AC-9).
        entries = await extractStudentEntries(await file.arrayBuffer(), { inferFileNamesWith: provider });
      }
      const oversized = firstOversizedEntryReason(entries);
      if (oversized) return { kind: "refused", reason: oversized };
      return { kind: "entries", entries, pointsPossible: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not read this file.";
      return { kind: "refused", reason: message };
    }
  }

  if (kind === "url") {
    const url = ((formData.get("url") as string | null) ?? "").trim();
    if (!url) {
      return { kind: "refused", reason: "No URL was provided." };
    }

    if (detectCanvasUrlKind(url)) {
      try {
        const { entries, pointsPossible } = await extractCanvasEntries(url);
        if (entries.length === 0) {
          return { kind: "refused", reason: "Nothing to grade was found at this Canvas URL." };
        }
        const oversized = firstOversizedEntryReason(entries);
        if (oversized) return { kind: "refused", reason: oversized };
        return { kind: "entries", entries, pointsPossible };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not read this Canvas URL.";
        return { kind: "refused", reason: message };
      }
    }

    const parsedGithub = parseSubmissionGithubUrl(url);
    if (!("error" in parsedGithub)) {
      const repoResult = await fetchGradableRepoContent(url);
      if ("error" in repoResult) {
        return { kind: "refused", reason: `Could not read this GitHub repository: ${repoResult.error}.` };
      }
      const entry = buildRepoUrlEntry(repoResult);
      const oversized = firstOversizedEntryReason([entry]);
      if (oversized) return { kind: "refused", reason: oversized };
      return { kind: "entries", entries: [entry], pointsPossible: null };
    }

    const driveTarget = parseGoogleDriveUrl(url);
    if (driveTarget) {
      if (driveTarget.kind === "folder") {
        return { kind: "refused", reason: DRIVE_FOLDER_MESSAGE };
      }
      if (driveTarget.kind === "native-doc" && driveTarget.docType !== "document") {
        return { kind: "refused", reason: DRIVE_SHEETS_SLIDES_MESSAGE };
      }
      try {
        const fetched = await fetchGoogleDriveFile(driveTarget);
        if ("error" in fetched) return { kind: "refused", reason: fetched.error };

        // From here a Drive file behaves exactly like a dropped file.
        const uploadKind = classifyGradingUpload(fetched.name);
        if (uploadKind === "unsupported") {
          return { kind: "refused", reason: DRIVE_UNSUPPORTED_TYPE_MESSAGE };
        }
        let entries: StudentSubmissionEntry[];
        if (uploadKind === "single") {
          const entry = await buildSingleFileEntry(fetched.name, fetched.buffer);
          if (!entry) return { kind: "refused", reason: "This file could not be read." };
          entries = [entry];
        } else {
          // Own ArrayBuffer, not Node's pooled one; A44's collision refusal
          // throws from here and is surfaced verbatim by the catch below.
          const bytes = new Uint8Array(fetched.buffer).slice().buffer;
          entries = await extractStudentEntries(bytes, { inferFileNamesWith: provider });
        }
        const oversized = firstOversizedEntryReason(entries);
        if (oversized) return { kind: "refused", reason: oversized };
        return { kind: "entries", entries, pointsPossible: null };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not read this Google Drive link.";
        return { kind: "refused", reason: message };
      }
    }

    return {
      kind: "refused",
      reason: "This surface accepts Canvas assignment/discussion URLs, GitHub repo URLs, and Google Drive share links. Other web URLs are not supported yet.",
    };
  }

  return { kind: "refused", reason: "This submission could not be read." };
}
