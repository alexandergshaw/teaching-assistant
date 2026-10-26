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
import { repoFilesToSubmittedFiles } from "@/lib/grade/repo-file-submissions";
import { getFileExtension } from "@/lib/office-extract";
import { classifyGradingUpload, buildSingleFileEntry } from "@/lib/grade/single-file-entry";
import {
  VIDEO_DRIVE_MESSAGE,
  VIDEO_PENDING_MESSAGE,
  VIDEO_UNSUPPORTED_FORMAT_MESSAGE,
  assertNeverUploadKind,
} from "@/lib/grade/video-grading";
import { VIDEO_HEAD_BYTES, sniffVideoContainer } from "@/lib/grade/video-magic";
import { extractStudentEntries, extractCanvasEntries, ingestZipEntries } from "@/lib/grade/extraction";
import { fetchGradableRepoContent, type GradableRepoContent } from "@/lib/grade/repo-content";
import { parseSubmissionGithubUrl } from "@/lib/submission-repo";
import { detectCanvasUrlKind } from "@/lib/canvas-url";
import { resolveInstitutionByCode } from "@/lib/canvas-core";
import { parseGoogleDriveUrl } from "@/lib/google-drive-url";
import { fetchGoogleDriveFile } from "@/lib/grade/google-drive-content";
import { resolveRunHeader } from "@/lib/grade/run-header";
import type { GradingRunHeader, StudentSubmissionEntry, SubmissionZipClassification } from "@/lib/grade/types";
import { estimateNeededWireBytes, ITEM_REQUEST_BYTE_BUDGET } from "@/app/components/grading/incrementalRunPlan";
import {
  buildTextEntry,
  extractSingleEntry,
  mergeCompositeEntries,
} from "@/app/components/grading-chat/chatSubmissionIntake";
import type { IntakeOutcome } from "@/app/components/grading-chat/chatSubmissionIntake";

// SEC-GC-3 (docs/grading-chat-security.md F4 Gap 1): bound before a
// generateRubric model call is ever spent, at the same figures route.ts
// already enforces at the per-item dispatch boundary (MAX_INSTRUCTIONS_CHARS
// / MAX_RUBRIC_CHARS, src/app/api/grade-run-item/route.ts:53-54) - so the two
// thresholds this repo already has for these fields do not silently disagree
// with a header-resolution path that had none.
const MAX_INSTRUCTIONS_CHARS = 20_000;
const MAX_RUBRIC_CHARS = 20_000;
// Bound on parts per composite, so one request cannot fan out unbounded
// extraction work (each part may fetch a repo or a Drive file).
const MAX_COMPOSITE_PARTS = 12;

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
    submittedFiles: repoFilesToSubmittedFiles(repo.files),
    repositoryInventories: repo.inventory ? [repo.inventory] : undefined,
    gradedRepo: repo.repo,
    gradedRef: repo.ref,
  };
}

/** Refuses any entry whose estimated wire size exceeds the per-item budget -
 * this surface has no whole-run fallback to route an oversized entry to
 * (do-not-reuse, architecture section 6), so it is a plain refusal. */
function firstOversizedEntryReason(entries: readonly StudentSubmissionEntry[]): string | null {
  for (const entry of entries) {
    if (estimateNeededWireBytes(entry) > ITEM_REQUEST_BYTE_BUDGET) {
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
  return resolveOnePart(kind, {
    provider: normalizeProvider(formData.get("provider") as string | null),
    content: (formData.get("content") as string | null) ?? "",
    label: (formData.get("label") as string | null) ?? undefined,
    ordinal: Number(formData.get("ordinal") ?? "1"),
    file: formData.get("file") as File | null,
    url: ((formData.get("url") as string | null) ?? "").trim(),
    labelled: (((formData.get("label") as string | null) ?? "").trim().length > 0),
  });
}

/** The decoded payload one submission part resolves from - the union of the
 * fields the three kinds read, so the single-submission action and the
 * composite action share ONE resolver. */
interface PartData {
  readonly provider: LlmProvider;
  readonly content: string;
  readonly label: string | undefined;
  readonly ordinal: number;
  readonly file: File | null;
  readonly url: string;
  /** True when the caller already knows this submission's name (a typed
   * label, or a composite's single owning student): inference is suppressed. */
  readonly labelled: boolean;
}

/** Module-private per-kind resolution shared by prepareChatSubmissionAction
 * and prepareCompositeSubmissionAction. Callers own the requireAppOwner()
 * guard; this never runs unauthenticated. */
async function resolveOnePart(kind: string, data: PartData): Promise<IntakeOutcome> {
  const { provider } = data;

  if (kind === "text") {
    const entry = buildTextEntry({ label: data.label, content: data.content }, Number.isFinite(data.ordinal) ? data.ordinal : 1);
    const oversized = firstOversizedEntryReason([entry]);
    if (oversized) return { kind: "refused", reason: oversized, refusalClass: "entry-too-large" };
    return { kind: "entries", entries: [entry], pointsPossible: null };
  }

  if (kind === "file") {
    const file = data.file;
    if (!file || file.size === 0) {
      return { kind: "refused", reason: "No file was attached.", refusalClass: "no-file" };
    }
    const budgetCheck = checkFileWireBudget(file.size, "This file");
    if (!budgetCheck.ok) {
      return { kind: "refused", reason: budgetCheck.error ?? "This file is too large to upload.", refusalClass: "over-wire-budget" };
    }

    const uploadKind = classifyGradingUpload(file.name);
    if (uploadKind === "unsupported") {
      return {
        kind: "refused",
        reason: "This file type isn't supported for grading. Upload a text file, document, image, or a zip archive.",
        refusalClass: "unsupported-type",
      };
    }
    if (uploadKind === "video") {
      // VIDEO-GRADING W1: no model seam yet. Bytes decide validity (magic
      // bytes), never the extension; a valid video is received-not-graded,
      // an invalid one is an unsupported format. Never reaches the zip path.
      const head = new Uint8Array(await file.slice(0, VIDEO_HEAD_BYTES).arrayBuffer());
      const sniff = sniffVideoContainer(head, getFileExtension(file.name));
      return {
        kind: "refused",
        reason: sniff.ok ? VIDEO_PENDING_MESSAGE : VIDEO_UNSUPPORTED_FORMAT_MESSAGE,
        videoFailure: sniff.ok ? "not supported here" : "unsupported format",
        refusalClass: sniff.ok ? "video-pending" : "video-bad-format",
      };
    }

    try {
      let entries: StudentSubmissionEntry[];
      let classification: SubmissionZipClassification | undefined;
      if (uploadKind === "single") {
        const entry = await buildSingleFileEntry(file.name, Buffer.from(await file.arrayBuffer()), provider, data.labelled);
        if (!entry) {
          return { kind: "refused", reason: "This file could not be read.", refusalClass: "unreadable-file" };
        }
        entries = [entry];
      } else if (uploadKind === "zip") {
        // A44's collision refusal throws from inside ingestZipEntries,
        // before any ticket exists - caught below, surfaced verbatim (AC-9).
        // ingestZipEntries is called directly (not extractStudentEntries) so
        // the zip's class-vs-single classification is not discarded.
        const ingested = await ingestZipEntries(await file.arrayBuffer(), { inferFileNamesWith: provider });
        entries = ingested.entries;
        classification = ingested.classification;
      } else {
        return assertNeverUploadKind(uploadKind);
      }
      const oversized = firstOversizedEntryReason(entries);
      if (oversized) return { kind: "refused", reason: oversized, refusalClass: "entry-too-large" };
      return classification
        ? { kind: "entries", entries, pointsPossible: null, classification }
        : { kind: "entries", entries, pointsPossible: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not read this file.";
      return { kind: "refused", reason: message, refusalClass: "read-failed" };
    }
  }

  if (kind === "url") {
    const url = data.url;
    if (!url) {
      return { kind: "refused", reason: "No URL was provided.", refusalClass: "no-url" };
    }

    if (detectCanvasUrlKind(url)) {
      try {
        const { entries, pointsPossible } = await extractCanvasEntries(url);
        if (entries.length === 0) {
          return { kind: "refused", reason: "Nothing to grade was found at this Canvas URL.", refusalClass: "canvas-empty" };
        }
        const oversized = firstOversizedEntryReason(entries);
        if (oversized) return { kind: "refused", reason: oversized, refusalClass: "entry-too-large" };
        return { kind: "entries", entries, pointsPossible };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not read this Canvas URL.";
        return { kind: "refused", reason: message, refusalClass: "canvas-failed" };
      }
    }

    const parsedGithub = parseSubmissionGithubUrl(url);
    if (!("error" in parsedGithub)) {
      const repoResult = await fetchGradableRepoContent(url);
      if ("error" in repoResult) {
        return { kind: "refused", reason: `Could not read this GitHub repository: ${repoResult.error}.`, refusalClass: "github-unreadable" };
      }
      const entry = buildRepoUrlEntry(repoResult);
      const oversized = firstOversizedEntryReason([entry]);
      if (oversized) return { kind: "refused", reason: oversized, refusalClass: "entry-too-large" };
      return { kind: "entries", entries: [entry], pointsPossible: null };
    }

    const driveTarget = parseGoogleDriveUrl(url);
    if (driveTarget) {
      if (driveTarget.kind === "folder") {
        return { kind: "refused", reason: DRIVE_FOLDER_MESSAGE, refusalClass: "drive-folder" };
      }
      if (driveTarget.kind === "native-doc" && driveTarget.docType !== "document") {
        return { kind: "refused", reason: DRIVE_SHEETS_SLIDES_MESSAGE, refusalClass: "drive-sheets-slides" };
      }
      try {
        const fetched = await fetchGoogleDriveFile(driveTarget);
        if ("error" in fetched) return { kind: "refused", reason: fetched.error, refusalClass: "drive-failed" };

        // From here a Drive file behaves exactly like a dropped file.
        const uploadKind = classifyGradingUpload(fetched.name);
        if (uploadKind === "unsupported") {
          return { kind: "refused", reason: DRIVE_UNSUPPORTED_TYPE_MESSAGE, refusalClass: "drive-unsupported-type" };
        }
        if (uploadKind === "video") {
          return { kind: "refused", reason: VIDEO_DRIVE_MESSAGE, videoFailure: "not supported here", refusalClass: "video-drive" };
        }
        let entries: StudentSubmissionEntry[];
        if (uploadKind === "single") {
          const entry = await buildSingleFileEntry(fetched.name, fetched.buffer, provider, data.labelled);
          if (!entry) return { kind: "refused", reason: "This file could not be read.", refusalClass: "unreadable-file" };
          entries = [entry];
        } else if (uploadKind === "zip") {
          // Own ArrayBuffer, not Node's pooled one; A44's collision refusal
          // throws from here and is surfaced verbatim by the catch below.
          const bytes = new Uint8Array(fetched.buffer).slice().buffer;
          entries = await extractStudentEntries(bytes, { inferFileNamesWith: provider });
        } else {
          return assertNeverUploadKind(uploadKind);
        }
        const oversized = firstOversizedEntryReason(entries);
        if (oversized) return { kind: "refused", reason: oversized, refusalClass: "entry-too-large" };
        return { kind: "entries", entries, pointsPossible: null };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not read this Google Drive link.";
        return { kind: "refused", reason: message, refusalClass: "drive-failed" };
      }
    }

    return {
      kind: "refused",
      reason: "This surface accepts Canvas assignment/discussion URLs, GitHub repo URLs, and Google Drive share links. Other web URLs are not supported yet.",
      refusalClass: "url-unsupported",
    };
  }

  return { kind: "refused", reason: "This submission could not be read.", refusalClass: "unknown-kind" };
}

/**
 * Composite submission: several parts (text / one file / one URL each) that
 * belong to ONE student, graded as ONE effort. FormData wire shape (scope
 * section 6): kind, student, provider, partCount, then per part
 * `part.<i>.kind` plus exactly one of `part.<i>.content` / `.file` / `.url`.
 * Every part must resolve to exactly one entry; the merged entry is oversize-
 * checked as a whole and returned with pointsPossible null (the session
 * rubric scale, never a part's).
 */
export async function prepareCompositeSubmissionAction(formData: FormData): Promise<IntakeOutcome> {
  await requireAppOwner();

  const student = ((formData.get("student") as string | null) ?? "").trim();
  const provider = normalizeProvider(formData.get("provider") as string | null);
  const partCount = Number(formData.get("partCount") ?? "0");
  if (!Number.isInteger(partCount) || partCount < 1 || partCount > MAX_COMPOSITE_PARTS) {
    return { kind: "refused", reason: `A composite submission needs between 1 and ${MAX_COMPOSITE_PARTS} parts.`, refusalClass: "composite-parts" };
  }

  const entries: StudentSubmissionEntry[] = [];
  for (let i = 0; i < partCount; i += 1) {
    const partLabel = `Part ${i + 1}`;
    const outcome = await resolveOnePart(((formData.get(`part.${i}.kind`) as string | null) ?? ""), {
      provider,
      content: (formData.get(`part.${i}.content`) as string | null) ?? "",
      label: "Text",
      ordinal: i + 1,
      file: formData.get(`part.${i}.file`) as File | null,
      url: ((formData.get(`part.${i}.url`) as string | null) ?? "").trim(),
      labelled: true,
    });
    const got = extractSingleEntry(outcome, partLabel);
    if (!got.ok) return got.refusalClass ? { kind: "refused", reason: got.reason, refusalClass: got.refusalClass } : { kind: "refused", reason: got.reason };
    entries.push(got.entry);
  }

  const merged = mergeCompositeEntries(entries, student);
  const oversized = firstOversizedEntryReason([merged]);
  if (oversized) return { kind: "refused", reason: oversized, refusalClass: "entry-too-large" };
  return { kind: "entries", entries: [merged], pointsPossible: null };
}

/**
 * LMS-SUBMISSIONS-ZIP-INTAKE: resolves a picked institution + course + assignment
 * to the Canvas assignment url the existing url intake already understands. The
 * url host is the owner's own configured base url (owner-only surface; the url
 * field already round-trips a pasted host). The Canvas token never leaves here.
 */
export async function buildLmsAssignmentUrlAction(
  institution: string,
  courseId: string,
  assignmentId: string,
): Promise<{ url: string } | { error: string }> {
  await requireAppOwner();
  const course = courseId.trim();
  const assignment = assignmentId.trim();
  if (!/^\d+$/.test(course) || !/^\d+$/.test(assignment)) {
    return { error: "Choose a course and an assignment." };
  }
  try {
    const { baseUrl } = await resolveInstitutionByCode(institution);
    return { url: `${baseUrl.replace(/\/+$/, "")}/courses/${course}/assignments/${assignment}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not resolve the institution." };
  }
}
