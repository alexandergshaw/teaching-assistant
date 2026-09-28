import JSZip from "jszip";
import {
  DOCUMENT_EXTENSIONS,
  TEXT_EXTENSIONS,
  extractTextFromBuffer,
  getFileExtension,
} from "../office-extract";
import { fetchCanvasWork, fetchAssignmentPointsPossible, type CanvasStudentWork } from "../canvas";
import { MAX_NESTED_ZIP_DEPTH, type SubmittedFileInfo, type StudentSubmissionEntry } from "./types";
import { IMAGE_EXTENSIONS, GEMINI_IMAGE_MIME_TYPES, getMimeType } from "./constants";
import { toPreviewContent, groupSubmissionsByStudent, assignUnclaimedLabel } from "./utils";
import { decideCollisionRefusal, describeCollisionRefusal } from "./collisionRefusal";
import { looksLikeGithubUrl } from "../submission-repo";
import { fetchGradableRepoContent } from "./repo-content";

async function extractTextFromFile(
  name: string,
  file: JSZip.JSZipObject
): Promise<string | null> {
  const extension = getFileExtension(name);

  if (TEXT_EXTENSIONS.has(extension)) {
    return file.async("string");
  }

  if (DOCUMENT_EXTENSIONS.has(extension)) {
    return extractTextFromBuffer(name, await file.async("nodebuffer"));
  }

  return null;
}

/** Extract text-based files from a zip archive. */
export async function extractSubmissions(
  zipBuffer: ArrayBuffer
): Promise<{
  submissions: Record<string, string>;
  rawData: Record<string, string>;
  attemptedSupportedFiles: number;
  failedSupportedFiles: string[];
  // A14: for every key also present in `submissions`/`rawData`, the whole
  // sequence of zip-archive entry names this file crossed to reach its
  // current path, OUTERMOST FIRST. A file that never crossed a zip boundary
  // (a flat Canvas entry, or a folder inside the single top-level zip) has
  // no key here at all - groupSubmissionsByStudent (./utils) treats a
  // missing key the same as an empty chain, which reproduces today's exact
  // behavior for that file.
  zipParents: Record<string, string[]>;
}> {
  const submissions: Record<string, string> = {};
  const rawData: Record<string, string> = {};
  const zipParents: Record<string, string[]> = {};
  let attemptedSupportedFiles = 0;
  const failedSupportedFiles: string[] = [];

  async function collectFromZip(
    zip: JSZip,
    depth: number,
    parentPath: string,
    zipChain: string[]
  ): Promise<void> {
    await Promise.all(
      Object.entries(zip.files).map(async ([name, file]) => {
        if (file.dir) return;

        const fullName = parentPath ? `${parentPath}/${name}` : name;
        const extension = getFileExtension(name);
        const isSupportedFile =
          TEXT_EXTENSIONS.has(extension) || DOCUMENT_EXTENSIONS.has(extension);

        if (extension === "zip" && depth < MAX_NESTED_ZIP_DEPTH) {
          try {
            const nestedBuffer = await file.async("arraybuffer");
            const nestedZip = await JSZip.loadAsync(nestedBuffer);
            await collectFromZip(nestedZip, depth + 1, fullName, [...zipChain, fullName]);
          } catch {
            // Continue when a nested archive cannot be opened.
          }
          return;
        }

        const isImage = IMAGE_EXTENSIONS.has(extension);

        if (!isSupportedFile && !isImage) {
          return;
        }

        if (isImage) {
          // Images carry no extractable text, but their presence matters (e.g.
          // required screenshots). Record a placeholder so the file is grouped
          // per student and surfaced in the file list, and keep the raw bytes so
          // the vision-capable grader can actually see it.
          const baseName = name.split("/").pop() ?? name;
          submissions[fullName] = `[Image file: ${baseName}]`;
          rawData[fullName] = await file.async("base64");
          if (zipChain.length > 0) zipParents[fullName] = zipChain;
          return;
        }

        attemptedSupportedFiles += 1;

        try {
          const extractedText = await extractTextFromFile(name, file);
          if (extractedText && extractedText.trim()) {
            submissions[fullName] = extractedText;
            rawData[fullName] = await file.async("base64");
            if (zipChain.length > 0) zipParents[fullName] = zipChain;
          } else {
            failedSupportedFiles.push(fullName);
          }
        } catch {
          failedSupportedFiles.push(fullName);
        }
      })
    );
  }

  const zip = await JSZip.loadAsync(zipBuffer);
  await collectFromZip(zip, 0, "", []);

  return {
    submissions,
    rawData,
    attemptedSupportedFiles,
    failedSupportedFiles,
    zipParents,
  };
}

/**
 * Group a submissions zip into per-student entries WITHOUT any LLM call (uses the
 * deterministic filename-convention parsing only). Feeds the Embedded
 * Deterministic Engine, which must never depend on a model.
 */
export async function extractStudentEntries(
  zipBuffer: ArrayBuffer
): Promise<StudentSubmissionEntry[]> {
  const { submissions, rawData, zipParents } = await extractSubmissions(zipBuffer);
  // A44 wave 2: refuse rather than silently blend a colliding parse. Placed
  // before grouping - the same seam Wave 1's fold lives in - and NOT inside
  // extractSubmissions/groupSubmissionsByStudent themselves (docs/a44-waves.md
  // 6.2: the first fires on the diagnostic-only testGeminiAction caller,
  // which grades nothing; the second breaks a frozen row-count
  // characterisation 28 pinned tests depend on).
  const collisionMessage = describeCollisionRefusal(decideCollisionRefusal(submissions, zipParents), zipParents);
  if (collisionMessage) {
    throw new Error(collisionMessage);
  }
  return groupSubmissionsByStudent(submissions, undefined, rawData, zipParents);
}

/**
 * Pull a Canvas discussion/assignment into per-student entries plus the
 * assignment's points_possible, reusing the same ingestion the AI path uses
 * (including the "skip already-graded submissions" filtering). No LLM call.
 */
export async function extractCanvasEntries(
  url: string
): Promise<{ entries: StudentSubmissionEntry[]; pointsPossible: number | null }> {
  const [{ students }, pointsPossible] = await Promise.all([
    fetchCanvasWork(url),
    fetchAssignmentPointsPossible(url),
  ]);
  const entries: StudentSubmissionEntry[] = [];
  for (const work of students) {
    entries.push(await canvasWorkToEntry(work));
  }
  return { entries: disambiguateCanvasEntries(entries), pointsPossible };
}

/**
 * RULING 129: Canvas hands over an authoritative numeric `userId` per entry,
 * but `student` (the display shown to the instructor, and the bare-name key
 * every layer below extraction - `seedEdits`, the results table, the Canvas
 * post payload - keys on) is decorative and Canvas does not guarantee it is
 * unique. Two enrolments with equal `sortable_name`/`display_name` strings
 * (or two submissions whose `user_id` was not a number, which both fall back
 * to the literal `"Unknown student"`) produce two `StudentSubmissionEntry`
 * rows sharing one display, and everything downstream keyed on that display
 * then collapses onto one slot - see docs/ruling-129.md for the full trace
 * and what this function does and does not protect against.
 *
 * This is NOT a refusal: Canvas can always tell the two students apart via
 * `userId`, so refusing would be a regression (that is the right response
 * only when identity genuinely cannot be told apart, as the zip path's own
 * `collisionRefusal.ts` is for). Instead this reuses the zip path's own
 * terminal disambiguation mechanism (`assignUnclaimedLabel` above, extracted
 * from `groupSubmissionsByStudent`'s identical pass) so the two paths never
 * grow two dialects of the same fix.
 *
 * Pure: `userId` and every other field are passed through untouched, only
 * `student` may change, and only on an entry whose display collided with an
 * earlier one. Walked in ENTRY-ARRAY order - a function of the entries alone,
 * never re-sorted here - so the result is deterministic for a given input
 * and the first entry holding any given display always keeps it unchanged;
 * later entries sharing that display get the first unclaimed
 * "<display> (2)", "<display> (3)", etc. What the label SAYS is left as-is
 * (RES-A46R2-6 in docs/a46-canvas-collision-scope.md): this does not invent
 * new copy, such as folding `userId` into the label, because that is a
 * product/UX decision this pass was told is the owner's to make.
 */
export function disambiguateCanvasEntries(
  entries: readonly StudentSubmissionEntry[]
): StudentSubmissionEntry[] {
  const takenLabels = new Set<string>();
  return entries.map((entry) => {
    const label = assignUnclaimedLabel(entry.student, takenLabels);
    takenLabels.add(label);
    return label === entry.student ? entry : { ...entry, student: label };
  });
}

/**
 * Turn one student's Canvas work (discussion text and/or uploaded files) into a
 * gradable entry: text and extracted file text go into `content`; image files
 * are attached with rawBase64 so the vision grader sees them (the same image
 * handling the zip path uses).
 */
export async function canvasWorkToEntry(work: CanvasStudentWork): Promise<StudentSubmissionEntry> {
  const contentParts: string[] = [];
  const submittedFiles: SubmittedFileInfo[] = [];
  let gradedRepo: string | null = null;
  let gradedRef: string | null = null;
  let repoReadNote: string | null = null;

  if (work.text) {
    contentParts.push(work.text);
    const preview = toPreviewContent(work.text);
    submittedFiles.push({
      name: work.files.length === 0 ? "Discussion post" : "Submission text",
      extension: "txt",
      previewContent: preview.text,
      previewTruncated: preview.truncated,
      mimeType: "text/plain",
    });
  }

  // A link-based submission (e.g. a GitHub repo URL) has no text/files of its
  // own: note the link itself (unchanged), and - when it looks like a GitHub
  // repository - fetch and grade the actual code (defect fix: this used to
  // stop at the note, so the grader graded the URL string, never the code).
  // A URL that is not a GitHub repo, or that could not be read, degrades to
  // the pre-existing text-only behavior with a note explaining why (AC2.3) -
  // it never fails the whole entry.
  if (work.submissionUrl) {
    contentParts.push(`Submitted link: ${work.submissionUrl}`);
    submittedFiles.push({
      name: "Submission link",
      extension: "url",
      previewContent: work.submissionUrl,
      previewTruncated: false,
      mimeType: "text/plain",
    });

    if (looksLikeGithubUrl(work.submissionUrl)) {
      // fetchGradableRepoContent is documented to never throw (every GitHub
      // failure mode maps to { error }), but one student's link must never be
      // able to abort the whole batch canvasWorkToEntry is called in a loop
      // for (gradeCanvasUrl/extractCanvasEntries) - so an unexpected
      // rejection here is caught the same way a reported { error } is: noted
      // and degraded to text-only grading, never re-thrown.
      try {
        const repoResult = await fetchGradableRepoContent(work.submissionUrl);
        if ("error" in repoResult) {
          repoReadNote = `Could not read the linked GitHub repository: ${repoResult.error}.`;
          contentParts.push(`Note: ${repoReadNote}`);
        } else {
          gradedRepo = repoResult.repo;
          gradedRef = repoResult.ref;
          contentParts.push(
            `GitHub repository code (${repoResult.repo} @ ${repoResult.ref}${repoResult.truncated ? ", trimmed to fit size limits" : ""}):\n\n${repoResult.content}`
          );
          // F5 (docs/grading-results-file-viewer-acceptance-criteria.md):
          // surface the real per-file list alongside the "Submission link"
          // pseudo-file above, so the Files column and browsing panel show
          // the actual graded source, not just a link to it.
          for (const file of repoResult.files) {
            submittedFiles.push({
              name: file.path,
              extension: getFileExtension(file.path),
              previewContent: file.text,
              previewTruncated: file.truncated ?? false,
              mimeType: "text/plain",
            });
          }
        }
      } catch (err) {
        repoReadNote = `Could not read the linked GitHub repository: ${err instanceof Error ? err.message : "an unexpected error occurred"}.`;
        contentParts.push(`Note: ${repoReadNote}`);
      }
    }
  }

  for (const file of work.files) {
    const extension = getFileExtension(file.name);

    if (IMAGE_EXTENSIONS.has(extension)) {
      const mimeType = GEMINI_IMAGE_MIME_TYPES.has(file.mimeType)
        ? file.mimeType
        : getMimeType(extension);
      submittedFiles.push({
        name: file.name,
        extension,
        previewContent: `[Image file: ${file.name}]`,
        previewTruncated: false,
        rawBase64: file.base64,
        mimeType,
      });
      continue;
    }

    let extracted: string | null = null;
    try {
      extracted = await extractTextFromBuffer(file.name, Buffer.from(file.base64, "base64"));
    } catch {
      extracted = null;
    }

    if (extracted && extracted.trim()) {
      contentParts.push(`File: ${file.name}\n\n${extracted}`);
      const preview = toPreviewContent(extracted);
      submittedFiles.push({
        name: file.name,
        extension,
        previewContent: preview.text,
        previewTruncated: preview.truncated,
        rawBase64: file.base64,
        mimeType: file.mimeType,
      });
    } else {
      submittedFiles.push({
        name: file.name,
        extension,
        previewContent: "No extractable text available for this file.",
        previewTruncated: false,
        rawBase64: file.base64,
        mimeType: file.mimeType,
      });
    }
  }

  return {
    student: work.student,
    content: contentParts.join("\n\n---\n\n"),
    mergedFileCount: Math.max(1, work.files.length + (work.text ? 1 : 0)),
    submittedFiles,
    userId: work.userId,
    submissionUrl: work.submissionUrl ?? null,
    gradedRepo,
    gradedRef,
    repoReadNote,
  };
}
