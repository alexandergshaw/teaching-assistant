import JSZip from "jszip";
import {
  DOCUMENT_EXTENSIONS,
  TEXT_EXTENSIONS,
  extractTextFromBuffer,
  getFileExtension,
} from "../office-extract";
import {
  fetchCanvasWork,
  fetchAssignmentPointsPossible,
  type CanvasStudentWork,
  type DiscussionActivity,
  type DiscussionPost,
} from "../canvas";
// A39 wave 4 (item #9): placed AFTER the ../canvas import above, not before
// it - docs/a39-fill-waves.md's W1 step S0 ran this exact import both above
// and below and measured runtime-import-graph.test.ts:703's frozen trail go
// RED above and GREEN below (F15 clause 3).
import { inferFileNameConvention } from "./rubric";
import type { LlmProvider } from "../llm";
import { MAX_NESTED_ZIP_DEPTH, type SubmittedFileInfo, type StudentSubmissionEntry } from "./types";
import { IMAGE_EXTENSIONS, GEMINI_IMAGE_MIME_TYPES, getMimeType } from "./constants";
import { toPreviewContent, groupSubmissionsByStudent, assignUnclaimedLabel } from "./utils";
import { decideCollisionRefusal, describeCollisionRefusal } from "./collisionRefusal";
import { looksLikeGithubUrl } from "../submission-repo";
import { fetchGradableRepoContent } from "./repo-content";
import { parseGoogleDriveUrl } from "../google-drive-url";
import { extractCanvasSubmittedUrl, normalizeSubmittedRepoUrl } from "./canvas-link-submission";

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
 * Group a submissions zip into per-student entries. No LLM call unless the
 * caller passes `inferFileNamesWith` (item #9, RES-FILL-10) - the Embedded
 * Deterministic Engine's own caller (src/app/actions/grading.ts:859) never
 * does, so it keeps today's deterministic-only behaviour unchanged; the
 * incremental route's caller (src/app/actions/grading-incremental.ts:91)
 * does, so it derives student names the same way the whole-run path already
 * does at engine.ts:390. src/lib/grade/extraction.inference.test.ts is the
 * executed enforcer of this contract, and
 * `grep -c "inferFileNamesWith" src/app/actions/grading.ts` -> 0 is its
 * backstop.
 */
export async function extractStudentEntries(
  zipBuffer: ArrayBuffer,
  options?: { readonly inferFileNamesWith?: LlmProvider }
): Promise<StudentSubmissionEntry[]> {
  const { entries } = await ingestZipEntries(zipBuffer, options);
  return entries;
}

/**
 * The shared ingestion chain (extract -> refuse -> infer -> group) that
 * extractStudentEntries and gradeSubmissions (engine.ts) both run. Inference
 * is opt-in here (`inferFileNamesWith`): extraction passes it only when asked,
 * the engine always passes its provider. Returns the grouped entries plus the
 * supported-file counters the engine's zero-entry policy reads; it never
 * applies a zero-entry policy itself.
 */
export async function ingestZipEntries(
  zipBuffer: ArrayBuffer,
  options?: { readonly inferFileNamesWith?: LlmProvider }
): Promise<{
  entries: StudentSubmissionEntry[];
  attemptedSupportedFiles: number;
  failedSupportedFiles: string[];
}> {
  const { submissions, rawData, zipParents, attemptedSupportedFiles, failedSupportedFiles } =
    await extractSubmissions(zipBuffer);
  // A44 wave 2: refuse rather than silently blend a colliding parse. Placed
  // before grouping - the same seam Wave 1's fold lives in - and NOT inside
  // extractSubmissions/groupSubmissionsByStudent themselves (docs/a44-waves.md
  // 6.2: the first fires on the diagnostic-only testGeminiAction caller,
  // which grades nothing; the second breaks a frozen row-count
  // characterisation 28 pinned tests depend on). Strictly before the
  // filename inference below too, so a colliding zip never pays a model
  // call (design section 4.3 step 2 before step 3; instrument notes M4).
  const collisionMessage = describeCollisionRefusal(decideCollisionRefusal(submissions, zipParents), zipParents);
  if (collisionMessage) {
    throw new Error(collisionMessage);
  }
  // Zip link submissions: resolve each Canvas link.html redirect to the code
  // it points at, before inference and grouping (runs unconditionally).
  await resolveLinkSubmissions(submissions, rawData);
  const inferredLookup = options?.inferFileNamesWith
    ? await inferFileNameConvention(Object.keys(submissions), options.inferFileNamesWith)
    : undefined;
  const entries = groupSubmissionsByStudent(submissions, inferredLookup, rawData, zipParents);
  return { entries, attemptedSupportedFiles, failedSupportedFiles };
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
 * A8 wave 2 (docs/a8-architecture.md section 3, docs/a8-waves.md WAVE 2): make
 * a contribution's `submittedFiles.name` unique against every name already
 * used by an earlier contribution in the same entry, appending " (2)", " (3)"
 * etc on collision - a student with two replies to the same classmate would
 * otherwise produce two identical "Reply to X" names, which would collide
 * FilesCell's React key (`` `${student}-file-name-${file.name}` ``,
 * FilesCell.tsx:41).
 */
function uniqueContributionName(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let n = 2;
  while (used.has(`${base} (${n})`)) n += 1;
  const unique = `${base} (${n})`;
  used.add(unique);
  return unique;
}

/**
 * A8 wave 2 (docs/a8-architecture.md D-1 / F-1): the submittedFiles NAME must
 * be dot-free so a dotted display name (e.g. "Dr. Alan Turing") cannot make
 * `buildSubmittedFileNamesBlock` (prompts.ts:271-274) mistake a reply label
 * for a real submitted file and inject a fake filename into the model's
 * file-list block - that filter drops a name only when it contains NO ".".
 * The `content` sections (below) keep the full display name; only this
 * submittedFiles-facing label is stripped.
 */
function dotFreeContributionName(name: string): string {
  return name.replace(/\./g, "");
}

/**
 * A8 wave 2 (docs/a8-architecture.md section 3, the G1 choke-point fix): build
 * a discussion contribution's `content` and `submittedFiles` from the already
 * split `DiscussionActivity` (initialPosts vs replies) instead of the flat
 * `work.text` concatenation, so a reply can never be represented as an
 * initial post. `content` begins with a code-composed manifest line built
 * from the integer counts, front-loaded so it survives `truncateSubmission`'s
 * blind prefix slice (docs/a8-architecture.md section 3.3) even when a long
 * initial post would otherwise crowd the reply prose out of the cap.
 */
function buildDiscussionEntry(discussion: DiscussionActivity): {
  content: string;
  submittedFiles: SubmittedFileInfo[];
  mergedFileCount: number;
  discussionAxes: NonNullable<StudentSubmissionEntry["discussionAxes"]>;
} {
  const initialPosts = discussion.initialPosts;
  const replies = discussion.replies;
  const initialCount = initialPosts.length;
  const replyCount = replies.length;

  const manifest =
    `This submission is a discussion contribution: ${initialCount} initial post${initialCount === 1 ? "" : "s"} ` +
    `and ${replyCount} repl${replyCount === 1 ? "y" : "ies"} to classmates. A reply is engagement with a ` +
    `classmate, not a second initial post; evaluate each contribution for what it is.`;

  const usedNames = new Set<string>();
  const submittedFiles: SubmittedFileInfo[] = [];

  function pushContribution(label: string, text: string): void {
    const preview = toPreviewContent(text);
    const name = dotFreeContributionName(uniqueContributionName(label, usedNames));
    submittedFiles.push({
      name,
      extension: "(none)",
      previewContent: preview.text,
      previewTruncated: preview.truncated,
      mimeType: "text/plain",
    });
  }

  const initialSectionParts: string[] = ["=== INITIAL POST ==="];
  if (initialCount === 0) {
    initialSectionParts.push("[This student did not write an initial post.]");
  } else {
    initialPosts.forEach((post: DiscussionPost, index: number) => {
      const label = index === 0 ? "Initial post" : `Initial post ${index + 1}`;
      if (index > 0) initialSectionParts.push(`--- ${label} ---`);
      initialSectionParts.push(post.text);
      pushContribution(label, post.text);
    });
  }

  const initialSection = initialSectionParts.join("\n\n");
  const contentSections: string[] = [manifest, initialSection];
  // A8 Wave B (docs/a8-scoring-architecture.md 2): the per-axis slices, built
  // from the SAME two section strings `content` is joined from, so they cannot
  // drift from it. initialPostContent carries NO reply prose, ever - the
  // code-held exclusion guarantee the engine's initial-axis pass relies on.
  let replyContent = "";

  if (replyCount > 0) {
    const replySectionParts: string[] = ["=== REPLIES TO CLASSMATES ==="];
    replies.forEach((reply: DiscussionPost) => {
      const label = reply.parentName ? `Reply to ${reply.parentName}` : "Reply";
      replySectionParts.push(`--- ${label} ---`);
      replySectionParts.push(reply.text);
      pushContribution(label, reply.text);
    });
    const replySection = replySectionParts.join("\n\n");
    contentSections.push(replySection);
    replyContent = [
      `This is the replies portion of a discussion contribution: ${replyCount} repl${replyCount === 1 ? "y" : "ies"} to classmates. Evaluate only these replies.`,
      replySection,
    ].join("\n\n");
  }

  const initialPostContent = [
    `This is the initial-post portion of a discussion contribution: ${initialCount} initial post${initialCount === 1 ? "" : "s"}. Evaluate only the initial post.`,
    initialSection,
  ].join("\n\n");

  return {
    content: contentSections.join("\n\n"),
    submittedFiles,
    mergedFileCount: Math.max(1, initialCount + replyCount),
    discussionAxes: { initialPostContent, replyContent, replyCount },
  };
}

/**
 * The shared GitHub fetch-and-fold step: fetch a GitHub link's gradable code
 * and turn it into one content part plus the per-file list. Used by BOTH
 * canvasWorkToEntry (Canvas link submissions) and resolveSubmittedLink (zip
 * link.html submissions) so the two never grow two dialects of the fold.
 *
 * fetchGradableRepoContent is documented to never throw (every GitHub failure
 * mode maps to { error }), but one student's link must never be able to abort
 * the batch this is called in a loop for - so an unexpected rejection is
 * caught the same way a reported { error } is: noted and degraded to
 * text-only grading, never re-thrown.
 */
async function foldGithubRepoContent(url: string): Promise<{
  contentPart: string;
  gradedRepo: string | null;
  gradedRef: string | null;
  repoReadNote: string | null;
  files: SubmittedFileInfo[];
}> {
  try {
    const repoResult = await fetchGradableRepoContent(url);
    if ("error" in repoResult) {
      const repoReadNote = `Could not read the linked GitHub repository: ${repoResult.error}.`;
      return { contentPart: `Note: ${repoReadNote}`, gradedRepo: null, gradedRef: null, repoReadNote, files: [] };
    }
    // F5 (docs/grading-results-file-viewer-acceptance-criteria.md): surface
    // the real per-file list alongside the "Submission link" pseudo-file, so
    // the Files column and browsing panel show the actual graded source, not
    // just a link to it.
    const files: SubmittedFileInfo[] = repoResult.files.map((file) => ({
      name: file.path,
      extension: getFileExtension(file.path),
      previewContent: file.text,
      previewTruncated: file.truncated ?? false,
      mimeType: "text/plain",
    }));
    return {
      contentPart: `GitHub repository code (${repoResult.repo} @ ${repoResult.ref}${repoResult.truncated ? ", trimmed to fit size limits" : ""}):\n\n${repoResult.content}`,
      gradedRepo: repoResult.repo,
      gradedRef: repoResult.ref,
      repoReadNote: null,
      files,
    };
  } catch (err) {
    const repoReadNote = `Could not read the linked GitHub repository: ${err instanceof Error ? err.message : "an unexpected error occurred"}.`;
    return { contentPart: `Note: ${repoReadNote}`, gradedRepo: null, gradedRef: null, repoReadNote, files: [] };
  }
}

/**
 * Resolve the URL a student submitted as a Canvas "Website URL" (extracted
 * from a zip's link.html) into gradable text. Never throws: every branch
 * returns content (repo code or a note) so one student's bad link cannot fail
 * the zip. SSRF posture: only known hosts resolve. GitHub (and vscode.dev,
 * mapped to GitHub) goes through fetchGradableRepoContent, which fetches
 * owner/repo/path against the GitHub API and never the pasted URL. Google
 * Drive is detected but NOT fetched in this wave; any other host is a note
 * with no fetch.
 */
async function resolveSubmittedLink(url: string): Promise<string> {
  const parts = [`Submitted link: ${url}`];
  const normalized = normalizeSubmittedRepoUrl(url);
  if (looksLikeGithubUrl(normalized)) {
    parts.push((await foldGithubRepoContent(normalized)).contentPart);
  } else if (parseGoogleDriveUrl(url)) {
    parts.push(
      `Note: This submission was a link to Google Drive (${url}); automatic fetch of Drive links from a zip is not supported yet.`
    );
  } else {
    parts.push(`Note: This submission was a link to ${url}; automatic fetch is not supported for this host.`);
  }
  return parts.join("\n\n---\n\n");
}

/**
 * Rewrite every Canvas link.html redirect page in `submissions` to the
 * content its URL resolves to. SEQUENTIAL on purpose (mirrors
 * extractCanvasEntries): a zip can hold many link files and each GitHub fetch
 * makes many API calls, so parallel fan-out would hit GitHub concurrency
 * limits and the serverless time cap. Ordinary html is left untouched.
 */
async function resolveLinkSubmissions(
  submissions: Record<string, string>,
  rawData: Record<string, string>
): Promise<void> {
  for (const path of Object.keys(submissions)) {
    const extension = getFileExtension(path);
    if (extension !== "html" && extension !== "htm") continue;
    const url = extractCanvasSubmittedUrl(submissions[path]);
    if (!url) continue;
    let resolved: string;
    try {
      resolved = await resolveSubmittedLink(url);
    } catch (err) {
      resolved = `Submitted link: ${url}\n\n---\n\nNote: Could not resolve the submitted link: ${err instanceof Error ? err.message : "an unexpected error occurred"}.`;
    }
    submissions[path] = resolved;
    delete rawData[path];
  }
}

/**
 * Turn one student's Canvas work (discussion text and/or uploaded files) into a
 * gradable entry: text and extracted file text go into `content`; image files
 * are attached with rawBase64 so the vision grader sees them (the same image
 * handling the zip path uses).
 */
export async function canvasWorkToEntry(work: CanvasStudentWork): Promise<StudentSubmissionEntry> {
  // A8 wave 2: a discussion source is built from the already-split
  // work.discussion (initialPosts vs replies), never from the flat work.text
  // concatenation, and returns EARLY so the work.text branch below does not
  // also run (a discussion work sets work.text too - see
  // docs/a8-architecture.md section 1.1/3 and docs/a8-test-notes.md REQ-1
  // assertion 4, which pins that a double-emit never ships).
  if (work.discussion) {
    const { content, submittedFiles, mergedFileCount, discussionAxes } = buildDiscussionEntry(work.discussion);
    return {
      student: work.student,
      content,
      discussionAxes,
      mergedFileCount,
      submittedFiles,
      userId: work.userId,
      submissionUrl: work.submissionUrl ?? null,
      gradedRepo: null,
      gradedRef: null,
      repoReadNote: null,
    };
  }

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
      const folded = await foldGithubRepoContent(work.submissionUrl);
      contentParts.push(folded.contentPart);
      gradedRepo = folded.gradedRepo;
      gradedRef = folded.gradedRef;
      repoReadNote = folded.repoReadNote;
      submittedFiles.push(...folded.files);
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
