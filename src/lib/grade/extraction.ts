import { canvasOmissionIdentityRefusal } from "../canvas/omitted-video";
import { prepareDocumentVisuals } from "./document-visuals";
import type { DocumentVisuals } from "./document-visual-schema";
import { hasCanvasPdfEnvelope } from "./canvas-pdf";
import { dotFreeContributionName, uniqueContributionName } from "./discussion-file-names";
import { isSubmissionFileInventories, type SubmissionFileInventory } from "./submission-file-inventory";
import { repoFilesToSubmittedFiles } from "./repo-file-submissions";
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
import {
  ZipCapError,
  chargeArchiveLevel,
  createZipBudget,
  readMemberBounded,
  runBounded,
  type PlannedZipMember,
  type ZipLimits,
} from "../zip-caps";
import type { LlmProvider } from "../llm";
import {
  MAX_NESTED_ZIP_DEPTH,
  type InferredFileNameLookup,
  type SubmissionZipClassification,
  type SubmittedFileInfo,
  type StudentSubmissionEntry,
} from "./types";
import { IMAGE_EXTENSIONS, GEMINI_IMAGE_MIME_TYPES, VIDEO_EXTENSIONS, VIDEO_GRADING_ENABLED, getMimeType, graderNeedsFileBytes } from "./constants";
import {
  VIDEO_LINK_NOTE,
  assertNeverUploadKind,
  videoPlaceholderNote,
} from "./video-grading";
import { chargeVideoCount, stageVideoMember, type StageVideoFn, type VideoStaging } from "./video-leaf";
import { emptyVideoOutcomes, withAcceptedVideo, withFailedVideo, type VideoFailureClass, type VideoOutcomes } from "./video-failure";
import { toPreviewContent, groupSubmissionsByStudent, assignUnclaimedLabel, parseSubmissionFileName } from "./utils";
import { reviewedZipLookup } from "./reviewed-zip-mapping";
import { decideCollisionRefusal, describeCollisionRefusal } from "./collisionRefusal";
import { classifySubmissionZip } from "./classify-submission-zip";
import { looksLikeGithubUrl } from "../submission-repo";
import { fetchGradableRepoContent } from "./repo-content";
import { parseGoogleDriveUrl } from "../google-drive-url";
import { extractCanvasSubmittedUrl, normalizeSubmittedRepoUrl } from "./canvas-link-submission";
import { planLinkResolution } from "./link-resolution-plan";
import { fetchGoogleDriveFile } from "./google-drive-content";
import { classifyGradingUpload, buildSingleFileEntry } from "./single-file-entry";
import { inlineRepositoryIssue, linkedArchiveIssue, mergeLinkIssues, withFoldedContent, withLinkNote, type LinkIssue } from "./link-evidence";
import { isArchiveBookkeeping, unreadableArchiveReason, unsupportedArchiveReason } from "./unsupported-archive";
export { MAX_ENTRY_CONTENT_CHARS } from "./link-evidence";

/** What one leaf member produced; merged into the result maps in ARCHIVE order. */
interface LeafOutcome {
  readonly fullName: string;
  readonly isImage: boolean;
  readonly visuals?: DocumentVisuals;
  /** VIDEO-GRADING W1: a video member. Never carries bytes (ops O-1). */
  readonly isVideo?: boolean;
  readonly staging?: VideoStaging;
  readonly videoFailure?: VideoFailureClass;
  readonly submission: string | null;
  readonly raw: string | null;
}

/**
 * Extract text-based files from a zip archive.
 *
 * ZIP-BOMB-CAPS (docs/zip-bomb-caps-scope.md): one shared budget covers every
 * nesting level; each level is checked from its declared sizes BEFORE any
 * member is decompressed; each member is then read ONCE through a bounded
 * reader and converted natively (toString "utf-8" / "base64"). A cap breach
 * throws a ZipCapError ("Refused: ..." prefix) and refuses the whole archive.
 * `options.limits` exists for tests; no production caller passes it.
 */
export async function extractSubmissions(
  zipBuffer: ArrayBuffer,
  options?: {
    readonly limits?: Partial<ZipLimits>;
    /** VIDEO-GRADING W1: defaults to the VIDEO_GRADING_ENABLED dark flag. */
    readonly videoEnabled?: boolean;
    /** VIDEO-GRADING W2: injected stager (the ingest route builds it). Absent =
     * the W1 placeholder, no bytes read. */
    readonly stageVideo?: StageVideoFn;
    /** VIDEO-GRADING W2: per-zip video cap; tests only, defaults to ZIP_MAX_VIDEO_MEMBERS. */
    readonly maxVideoMembers?: number;
  }
): Promise<{
  submissions: Record<string, string>;
  rawData: Record<string, string>;
  documentVisuals: Record<string, DocumentVisuals>;
  attemptedSupportedFiles: number;
  failedSupportedFiles: string[];
  unsupportedFiles: string[];
  // A14: for every key also present in `submissions`/`rawData`, the whole
  // sequence of zip-archive entry names this file crossed to reach its
  // current path, OUTERMOST FIRST. A file that never crossed a zip boundary
  // (a flat Canvas entry, or a folder inside the single top-level zip) has
  // no key here at all - groupSubmissionsByStudent (./utils) treats a
  // missing key the same as an empty chain, which reproduces today's exact
  // behavior for that file.
  zipParents: Record<string, string[]>;
  videoStaging: Record<string, VideoStaging>;
  videoOutcomes: VideoOutcomes;
}> {
  const submissions: Record<string, string> = {};
  const rawData: Record<string, string> = {};
  const documentVisuals: Record<string, DocumentVisuals> = {};
  const zipParents: Record<string, string[]> = {};
  let attemptedSupportedFiles = 0;
  const failedSupportedFiles: string[] = [];
  const unsupportedFiles: string[] = [];
  const budget = createZipBudget(options?.limits);
  const videoEnabled = options?.videoEnabled ?? VIDEO_GRADING_ENABLED;
  const videoStaging: Record<string, VideoStaging> = {};
  let videoOutcomes = emptyVideoOutcomes();
  let videoMembersSeen = 0;

  async function collectFromZip(
    zip: JSZip,
    depth: number,
    parentPath: string,
    zipChain: string[]
  ): Promise<void> {
    const planned = chargeArchiveLevel(zip, budget, {
      parentPath,
      chain: zipChain,
      onSkip: (name) => { if (!isArchiveBookkeeping(name)) unsupportedFiles.push(name); },
      classify: (name) => {
        if (name === "PARTIAL_ARCHIVE_REQUIRES_REVIEW.json") return "skip";
        if (isArchiveBookkeeping(parentPath ? `${parentPath}/${name}` : name)) return "skip";
        const extension = getFileExtension(name);
        if (extension === "zip" && depth < MAX_NESTED_ZIP_DEPTH) return "nested";
        if (IMAGE_EXTENSIONS.has(extension)) return "leaf";
        if (TEXT_EXTENSIONS.has(extension) || DOCUMENT_EXTENSIONS.has(extension)) return "leaf";
        // A video is a leaf (charged against the caps and counted), never a
        // silent skip; flag off keeps today's skip.
        if (videoEnabled && VIDEO_EXTENSIONS.has(extension)) return "leaf";
        return "skip";
      },
    });

    // Per-zip video cap, from the plan and BEFORE any member is read.
    if (videoEnabled) {
      videoMembersSeen = chargeVideoCount(planned, videoMembersSeen, zipChain, options?.maxVideoMembers);
    }

    const leaves: PlannedZipMember[] = planned.filter((member) => member.kind === "leaf");
    const nested: PlannedZipMember[] = planned.filter((member) => member.kind === "nested");
    const outcomes: Array<LeafOutcome | null> = leaves.map(() => null);

    await runBounded(leaves, budget.limits.concurrency, async (member, index) => {
      const { name, fullName, entry, declared } = member;
      const extension = getFileExtension(name);

      if (videoEnabled && VIDEO_EXTENSIONS.has(extension) && options?.stageVideo) {
        // Sniff, stage to Storage via the injected stager, keep only a ref. The
        // generic branch's catch shape: one bad video is one failed file.
        const baseName = name.split("/").pop() ?? name;
        try {
          const bytes = await readMemberBounded(entry, declared, fullName, zipChain, budget.limits);
          const staged = await stageVideoMember({ bytes, extension, baseName, stageVideo: options.stageVideo });
          outcomes[index] = staged.ok
            ? { fullName, isImage: false, isVideo: true, staging: staged.staging, submission: staged.note, raw: "" }
            : { fullName, isImage: false, isVideo: true, videoFailure: staged.failure, submission: null, raw: null };
        } catch (err) {
          if (err instanceof ZipCapError) throw err;
          outcomes[index] = { fullName, isImage: false, isVideo: true, videoFailure: "extraction failed", submission: null, raw: null };
        }
        return;
      }

      if (videoEnabled && VIDEO_EXTENSIONS.has(extension)) {
        // No stager: record a worded placeholder and read NO bytes.
        // raw "" (not null, which means failed) and isVideo keep the video
        // out of rawData, so no rawBase64 ever rides a video entry (ops O-1).
        const baseName = name.split("/").pop() ?? name;
        outcomes[index] = {
          fullName,
          isImage: false,
          isVideo: true,
          submission: videoPlaceholderNote(baseName),
          raw: "",
        };
        return;
      }

      if (IMAGE_EXTENSIONS.has(extension)) {
        // Images carry no extractable text, but their presence matters (e.g.
        // required screenshots). Record a placeholder so the file is grouped
        // per student and surfaced in the file list, and keep the raw bytes so
        // the vision-capable grader can actually see it.
        const bytes = await readMemberBounded(entry, declared, fullName, zipChain, budget.limits);
        const baseName = name.split("/").pop() ?? name;
        outcomes[index] = {
          fullName,
          isImage: true,
          submission: `[Image file: ${baseName}]`,
          raw: bytes.toString("base64"),
        };
        return;
      }

      try {
        const bytes = await readMemberBounded(entry, declared, fullName, zipChain, budget.limits);
        let extractedText: string | null = null;
        let extractionFailed = false;
        try { extractedText = await extractTextFromBuffer(name, bytes, { budget }); }
        catch (err) { if (err instanceof ZipCapError) throw err; extractionFailed = true; }
        const visuals = extension === "docx" || extension === "pptx"
          ? await prepareDocumentVisuals(extension, bytes) : undefined;
        if ((extractionFailed || extractedText === null) && visuals) {
          outcomes[index] = { fullName, isImage: false, submission: null, raw: null };
          return;
        }
        const content = extractedText?.trim() ? extractedText
          : visuals && visuals.found > 0 ? `[Document with embedded pictures: ${name}; no extracted text]` : null;
        outcomes[index] = content
          ? { fullName, isImage: false, submission: content, raw: bytes.toString("base64"), visuals }
          : { fullName, isImage: false, submission: null, raw: null };
      } catch (err) {
        // A cap breach refuses the whole archive; every other failure is this
        // one file failing to extract, exactly as before.
        if (err instanceof ZipCapError) throw err;
        outcomes[index] = { fullName, isImage: false, submission: null, raw: null };
      }
    });

    // Merge in ARCHIVE order (scope D7): the pool settles in completion order,
    // the maps must not.
    for (const outcome of outcomes) {
      if (!outcome) continue;
      if (!outcome.isImage) attemptedSupportedFiles += 1;
      if (outcome.submission === null || outcome.raw === null) {
        failedSupportedFiles.push(outcome.fullName);
        if (outcome.videoFailure) videoOutcomes = withFailedVideo(videoOutcomes, outcome.videoFailure);
        continue;
      }
      if (outcome.staging) {
        videoStaging[outcome.fullName] = outcome.staging;
        videoOutcomes = withAcceptedVideo(videoOutcomes);
      }
      submissions[outcome.fullName] = outcome.submission;
      if (!outcome.isVideo) rawData[outcome.fullName] = outcome.raw;
      if (outcome.visuals) documentVisuals[outcome.fullName] = outcome.visuals;
      if (zipChain.length > 0) zipParents[outcome.fullName] = zipChain;
    }

    // Nested archives one at a time, in archive order, so at most one nested
    // buffer per depth is alive and the shared budget is charged
    // deterministically.
    for (const member of nested) {
      try {
        const nestedBuffer = await readMemberBounded(
          member.entry,
          member.declared,
          member.fullName,
          zipChain,
          budget.limits
        );
        const nestedZip = await JSZip.loadAsync(nestedBuffer);
        await collectFromZip(nestedZip, depth + 1, member.fullName, [...zipChain, member.fullName]);
      } catch (err) {
        if (err instanceof ZipCapError) throw err;
        // A nested archive that cannot be opened is surfaced as a failed file
        // (named by its archive path) instead of silently dropped; the batch
        // continues so other students are unaffected.
        attemptedSupportedFiles += 1;
        failedSupportedFiles.push(member.fullName);
      }
    }
  }

  const zip = await JSZip.loadAsync(zipBuffer);
  await collectFromZip(zip, 0, "", []);

  return {
    submissions,
    rawData,
    documentVisuals,
    attemptedSupportedFiles,
    failedSupportedFiles,
    unsupportedFiles,
    zipParents,
    videoStaging,
    videoOutcomes,
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
  options?: { readonly inferFileNamesWith?: LlmProvider; readonly knownStudents?: readonly string[] }
): Promise<StudentSubmissionEntry[]> {
  const { entries } = await ingestZipEntries(zipBuffer, { ...options, requireSupportedFiles: true });
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
  options?: {
    readonly inferFileNamesWith?: LlmProvider;
    /**
     * BULK-ZIP BW3. Default false = today's inline resolution (the batch /
     * engine path is untouched). True (only the bulk ingest route): link.html
     * files are NOT fetched here; each link student's entry carries
     * `submissionUrl` plus a bare "Submitted link" note, and the fetch happens
     * per item at grade time (resolveEntryLinks).
     */
    readonly deferLinks?: boolean;
    /** VIDEO-GRADING W1: defaults to the VIDEO_GRADING_ENABLED dark flag. */
    readonly videoEnabled?: boolean;
    /** VIDEO-GRADING W2: injected stager (see extractSubmissions). */
    readonly stageVideo?: StageVideoFn;
    /** A45: course roster names the collision check corroborates against. */
    readonly knownStudents?: readonly string[];
    /** Refuse unsupported or unreadable members before inference or linked fetches. */
    readonly requireSupportedFiles?: boolean;
    /** Explicitly reviewed file-to-student mapping for a partial archive. */
    readonly reviewedMapping?: Readonly<Record<string, string>>;
  }
): Promise<{
  entries: StudentSubmissionEntry[];
  attemptedSupportedFiles: number;
  failedSupportedFiles: string[];
  unsupportedFiles: string[];
  classification: SubmissionZipClassification;
  videoOutcomes?: VideoOutcomes;
}> {
  const { submissions, rawData, documentVisuals, zipParents, attemptedSupportedFiles, failedSupportedFiles, unsupportedFiles, videoStaging, videoOutcomes } =
    await extractSubmissions(zipBuffer, { videoEnabled: options?.videoEnabled, stageVideo: options?.stageVideo });
  const incompleteReason = options?.requireSupportedFiles ? (unsupportedArchiveReason(unsupportedFiles) ?? unreadableArchiveReason(failedSupportedFiles)) : null;
  if (incompleteReason) throw new Error(incompleteReason);
  // A44 wave 2: refuse rather than silently blend a colliding parse. Placed
  // before grouping - the same seam Wave 1's fold lives in - and NOT inside
  // extractSubmissions/groupSubmissionsByStudent themselves (docs/a44-waves.md
  // 6.2: the first fires on the diagnostic-only testGeminiAction caller,
  // which grades nothing; the second breaks a frozen row-count
  // characterisation 28 pinned tests depend on). Strictly before the
  // filename inference below too, so a colliding zip never pays a model
  // call (design section 4.3 step 2 before step 3; instrument notes M4).
  const collisionMessage = describeCollisionRefusal(decideCollisionRefusal(submissions, zipParents, options?.knownStudents), zipParents);
  if (collisionMessage) {
    throw new Error(collisionMessage);
  }
  // Zip link submissions: resolve each Canvas link.html redirect to the code
  // it points at, before inference and grouping (runs unconditionally).
  let deferredLinks: Map<string, string> | null = null;
  let inlineRepos = new Map<string, Awaited<ReturnType<typeof foldGithubRepoContent>>>();
  let inlineOtherIssues = new Map<string, LinkIssue>();
  if (options?.deferLinks) {
    deferredLinks = deferLinkSubmissions(submissions);
  } else {
    ({ repos: inlineRepos, issues: inlineOtherIssues } = await resolveLinkSubmissions(submissions, rawData));
  }
  let inferredLookup = options?.inferFileNamesWith && !options.reviewedMapping
    ? await inferFileNameConvention(Object.keys(submissions), options.inferFileNamesWith)
    : undefined;
  if (options?.reviewedMapping) inferredLookup = reviewedZipLookup(submissions, options.reviewedMapping, zipParents);
  const entries: StudentSubmissionEntry[] = groupSubmissionsByStudent(submissions, inferredLookup, rawData, zipParents, videoStaging, documentVisuals);
  if (deferredLinks && deferredLinks.size > 0) {
    attachDeferredLinkUrls(entries, deferredLinks, inferredLookup, zipParents);
  }
  const foldedByEntry = new Map<StudentSubmissionEntry, Array<Awaited<ReturnType<typeof foldGithubRepoContent>>>>();
  const issuesByEntry = new Map<StudentSubmissionEntry, LinkIssue[]>();
  for (const [path, folded] of inlineRepos) {
    const parsed = parseSubmissionFileName(path, inferredLookup, zipParents[path]);
    const targets = entries.filter((entry) => parsed.studentDisplay === entry.student && entry.submittedFiles.some((file) => file.name === parsed.citationFileName));
    if (targets.length !== 1) throw new Error("Submitted repository links could not be attributed to a single student.");
    foldedByEntry.set(targets[0], [...(foldedByEntry.get(targets[0]) ?? []), folded]);
  }
  for (const [path, issue] of inlineOtherIssues) {
    const parsed = parseSubmissionFileName(path, inferredLookup, zipParents[path]);
    const targets = entries.filter((entry) => parsed.studentDisplay === entry.student && entry.submittedFiles.some((file) => file.name === parsed.citationFileName));
    if (targets.length !== 1) throw new Error("Submitted links could not be attributed to a single student.");
    issuesByEntry.set(targets[0], [...(issuesByEntry.get(targets[0]) ?? []), issue]);
  }
  for (const [entry, folded] of foldedByEntry) {
    const inventories = folded.flatMap((repo) => repo.inventory ? [repo.inventory] : []);
    if (!isSubmissionFileInventories(inventories)) throw new Error("Submitted repository link inventories exceed supported metadata limits.");
    entry.repositoryInventories = inventories.length ? inventories : undefined;
    for (const file of folded.flatMap((repo) => repo.files)) if (!entry.submittedFiles.some((existing) => existing.name === file.name && existing.previewContent === file.previewContent)) entry.submittedFiles.push(file);
    if (folded.length === 1) { entry.gradedRepo = folded[0].gradedRepo; entry.gradedRef = folded[0].gradedRef; }
    const issue = inlineRepositoryIssue(folded);
    if (issue) issuesByEntry.set(entry, [...(issuesByEntry.get(entry) ?? []), issue]);
  }
  for (const [entry, issues] of issuesByEntry) { const issue = mergeLinkIssues(issues); if (issue) { entry.linkFetch = issue.status; entry.repoReadNote = issue.note; } }
  const classification = classifySubmissionZip(submissions, inferredLookup, zipParents);
  return { entries, attemptedSupportedFiles, failedSupportedFiles, unsupportedFiles, classification, videoOutcomes };
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
  const identityRefusal = canvasOmissionIdentityRefusal(students);
  if (identityRefusal) throw new Error(identityRefusal);
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
  inventory?: SubmissionFileInventory;
}> {
  try {
    const repoResult = await fetchGradableRepoContent(url);
    if ("error" in repoResult) {
      const repoReadNote = `Could not read the linked GitHub repository: ${repoResult.error}.`;
      return { contentPart: `Note: ${repoReadNote}`, gradedRepo: null, gradedRef: null, repoReadNote, files: [], inventory: repoResult.inventory };
    }
    // F5 (docs/grading-results-file-viewer-acceptance-criteria.md): surface
    // the real per-file list alongside the "Submission link" pseudo-file, so
    // the Files column and browsing panel show the actual graded source, not
    // just a link to it.
    const files: SubmittedFileInfo[] = repoFilesToSubmittedFiles(repoResult.files);
    return {
      contentPart: `GitHub repository code (${repoResult.repo} @ ${repoResult.ref}${repoResult.truncated ? ", trimmed to fit size limits" : ""}):\n\n${repoResult.content}`,
      gradedRepo: repoResult.repo,
      gradedRef: repoResult.ref,
      repoReadNote: repoResult.truncated ? "The linked GitHub repository could not be read completely." : null,
      files,
      inventory: repoResult.inventory,
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
async function resolveSubmittedLink(url: string, onRepo?: (folded: Awaited<ReturnType<typeof foldGithubRepoContent>>) => void, onUnfetched?: (note: string) => void): Promise<string> {
  const parts = [`Submitted link: ${url}`];
  const normalized = normalizeSubmittedRepoUrl(url);
  if (looksLikeGithubUrl(normalized)) {
    const folded = await foldGithubRepoContent(normalized);
    onRepo?.(folded);
    parts.push(folded.contentPart);
  } else if (parseGoogleDriveUrl(url)) {
    onUnfetched?.("A Google Drive link inside the archive was not fetched.");
    parts.push(
      `Note: This submission was a link to Google Drive (${url}); automatic fetch of Drive links from a zip is not supported yet.`
    );
  } else {
    onUnfetched?.("A link inside the archive was not fetched because its host is unsupported.");
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
): Promise<{ repos: Map<string, Awaited<ReturnType<typeof foldGithubRepoContent>>>; issues: Map<string, LinkIssue> }> {
  const repos = new Map<string, Awaited<ReturnType<typeof foldGithubRepoContent>>>();
  const issues = new Map<string, LinkIssue>();
  for (const path of Object.keys(submissions)) {
    const extension = getFileExtension(path);
    if (extension !== "html" && extension !== "htm") continue;
    const url = extractCanvasSubmittedUrl(submissions[path]);
    if (!url) continue;
    let resolved: string;
    try {
      resolved = await resolveSubmittedLink(url, (folded) => repos.set(path, folded), (note) => issues.set(path, { status: "flagged", note }));
    } catch (err) {
      resolved = `Submitted link: ${url}\n\n---\n\nNote: Could not resolve the submitted link: ${err instanceof Error ? err.message : "an unexpected error occurred"}.`;
      issues.set(path, { status: "failed", note: "A link inside the archive could not be resolved." });
    }
    submissions[path] = resolved;
    delete rawData[path];
  }
  return { repos, issues };
}

/**
 * BULK-ZIP BW3 (deferLinks): rewrite every Canvas link.html redirect page to a
 * bare "Submitted link: <url>" note WITHOUT fetching, and return path -> url so
 * the URL can be attached to its owning entry after grouping. rawData is left
 * as-is.
 */
function deferLinkSubmissions(submissions: Record<string, string>): Map<string, string> {
  const urlByPath = new Map<string, string>();
  for (const path of Object.keys(submissions)) {
    const extension = getFileExtension(path);
    if (extension !== "html" && extension !== "htm") continue;
    const url = extractCanvasSubmittedUrl(submissions[path]);
    if (!url) continue;
    urlByPath.set(path, url);
    submissions[path] = `Submitted link: ${url}`;
  }
  return urlByPath;
}

const UNMATCHED_LINK_NOTE = "submitted link could not be matched to a single student";

function linkKey(studentDisplay: string, citationName: string): string {
  return JSON.stringify([studentDisplay.toLowerCase(), citationName]);
}

/**
 * BULK-ZIP BW3 post-group pass (checker B2). groupSubmissionsByStudent keeps no
 * raw path: an entry's `submittedFiles[].name` is the STRIPPED citation name.
 * So the link map is keyed on the citation name, computed with the SAME
 * parseSubmissionFileName call the grouping used (after inference, which it
 * depends on) - never on the path.
 *
 * The key also carries the student display. On the Canvas `name_id_id_` zips
 * the citation name alone is the bare "link.html" for EVERY student, so a
 * citation-only key would collide across the whole zip and attach nothing.
 * A URL attaches only when its (student, citation name) key maps to exactly
 * ONE link path in the zip; any collision (one student with two link files that
 * strip alike) attaches nothing and flags the entry, and an entry whose
 * display was re-labelled by the A44 disambiguation simply finds no key. A URL
 * is therefore never cross-attached to the wrong student.
 */
function attachDeferredLinkUrls(
  entries: StudentSubmissionEntry[],
  urlByPath: ReadonlyMap<string, string>,
  inferredLookup: InferredFileNameLookup | undefined,
  zipParents: Record<string, string[]>
): void {
  const byKey = new Map<string, { url: string; linkPaths: Set<string> }>();
  for (const [linkPath, url] of urlByPath) {
    const parsed = parseSubmissionFileName(linkPath, inferredLookup, zipParents[linkPath]);
    const key = linkKey(parsed.studentDisplay, parsed.citationFileName);
    const slot = byKey.get(key);
    if (slot) slot.linkPaths.add(linkPath);
    else byKey.set(key, { url, linkPaths: new Set([linkPath]) });
  }
  for (const entry of entries) {
    const urls = new Set<string>();
    let ambiguous = false;
    for (const file of entry.submittedFiles) {
      const slot = byKey.get(linkKey(entry.student, file.name));
      if (!slot) {
        if (/^Submitted link:\s*https?:\/\//i.test(file.previewContent)) ambiguous = true;
        continue;
      }
      if (slot.linkPaths.size === 1) urls.add(slot.url);
      else ambiguous = true;
    }
    if (ambiguous || urls.size > 1) {
      entry.repoReadNote = UNMATCHED_LINK_NOTE;
      entry.linkFetch = "flagged";
    } else if (urls.size === 1) {
      entry.submissionUrl = [...urls][0];
    }
  }
}

async function resolveEntryLinksUnsafe(entry: StudentSubmissionEntry): Promise<StudentSubmissionEntry> {
  const url = entry.submissionUrl;
  if (typeof url !== "string" || url.trim().length === 0) return entry;
  // A Canvas-path entry arrives already resolved (canvasWorkToEntry folded it).
  if (entry.gradedRepo || entry.repoReadNote || entry.linkFetch) return entry;

  const plan = planLinkResolution(url);
  if (plan.action === "flag") {
    return withLinkNote(entry, "flagged", `link not fetched: ${plan.reason ?? "unsupported link"}`);
  }

  if (plan.action === "github") {
    const folded = await foldGithubRepoContent(normalizeSubmittedRepoUrl(url));
    if (folded.gradedRepo === null) {
      return { ...withLinkNote(entry, "failed", folded.repoReadNote ?? "Could not read the linked GitHub repository."), repositoryInventories: folded.inventory ? [folded.inventory] : undefined };
    }
    const result = withFoldedContent(entry, folded.contentPart, folded.files, {
      gradedRepo: folded.gradedRepo,
      gradedRef: folded.gradedRef,
      repositoryInventories: folded.inventory ? [folded.inventory] : undefined,
    });
    return folded.repoReadNote ? withLinkNote(result, "flagged", folded.repoReadNote) : result;
  }

  const target = parseGoogleDriveUrl(url);
  if (!target) return withLinkNote(entry, "flagged", "link not fetched: not a Google Drive link");
  const fetched = await fetchGoogleDriveFile(target);
  if ("error" in fetched) {
    return withLinkNote(entry, "failed", `Could not read the linked Google Drive file: ${fetched.error}`);
  }

  const kind = classifyGradingUpload(fetched.name);
  if (kind === "unsupported") {
    return withLinkNote(entry, "flagged", "link not fetched: the linked Drive file type is not supported for grading");
  }
  if (kind === "video") {
    return withLinkNote(entry, "flagged", VIDEO_LINK_NOTE);
  }
  let linked: StudentSubmissionEntry[];
  let unreadableArchiveFiles = 0;
  let unsupportedArchiveFiles = 0;
  let unavailableArchiveVideos = 0;
  if (kind === "single") {
    const single = await buildSingleFileEntry(fetched.name, fetched.buffer, undefined, true);
    linked = single ? [single] : [];
  } else if (kind === "zip") {
    // Own ArrayBuffer, not Node's pooled one.
    const ingested = await ingestZipEntries(new Uint8Array(fetched.buffer).slice().buffer, { videoEnabled: true });
    linked = ingested.entries;
    unreadableArchiveFiles = ingested.failedSupportedFiles.length;
    unsupportedArchiveFiles = ingested.unsupportedFiles.length;
    unavailableArchiveVideos = linked.reduce((count, item) => count + item.submittedFiles.filter((file) => VIDEO_EXTENSIONS.has(file.extension.toLowerCase()) && !file.videoRef).length, 0);
  } else {
    return assertNeverUploadKind(kind);
  }
  // M1 single-entry guard: an archive (or an unreadable file) must never fan
  // several students into this one row (the A44 blend).
  const issue = linkedArchiveIssue(unreadableArchiveFiles, unavailableArchiveVideos, linked, unsupportedArchiveFiles);
  if (linked.length !== 1) {
    return withLinkNote(entry, issue?.status ?? "flagged", `The linked Drive file could not be used as a single submission.${issue ? ` ${issue.note}` : ""}`);
  }
  const inventories = [...(entry.repositoryInventories ?? []), ...(linked[0].repositoryInventories ?? [])];
  if (!isSubmissionFileInventories(inventories)) return withLinkNote(entry, "failed", "Linked repository inventories exceed supported metadata limits.");
  const folded = withFoldedContent(
    entry,
    `Linked Google Drive file (${fetched.name}):\n\n${linked[0].content}`,
    linked[0].submittedFiles,
    { mergedFileCount: entry.mergedFileCount + linked[0].mergedFileCount, ...(inventories.length ? { repositoryInventories: inventories } : {}) }
  );
  return issue ? withLinkNote(folded, issue.status, issue.note) : folded;
}

/**
 * BULK-ZIP BW3: resolve an entry's `submissionUrl` at GRADE time. NEVER throws
 * (a thrown error degrades to the bare note with linkFetch "failed"). An entry
 * with no `submissionUrl`, or one already resolved, is returned unchanged.
 * Sets `linkFetch` ("ok" | "failed" | "flagged") and re-clamps the folded
 * content to MAX_ENTRY_CONTENT_CHARS. SSRF posture: GitHub goes through the
 * hardened parser + fetchGradableRepoContent; Drive only through
 * parseGoogleDriveUrl + fetchGoogleDriveFile's host allowlist; any other host
 * is flagged, never fetched.
 */
export async function resolveEntryLinks(entry: StudentSubmissionEntry): Promise<StudentSubmissionEntry> {
  try {
    return await resolveEntryLinksUnsafe(entry);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "an unexpected error occurred";
    return withLinkNote(entry, "failed", `Could not resolve the submitted link: ${reason}.`);
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
  const unreadableFiles: SubmittedFileInfo[] = [];
  let gradedRepo: string | null = null;
  let gradedRef: string | null = null;
  let repoReadNote: string | null = null;
  let repositoryInventories: SubmissionFileInventory[] | undefined;

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
      repositoryInventories = folded.inventory ? [folded.inventory] : undefined;
      submittedFiles.push(...folded.files);
    }
  }

  for (const file of work.files) {
    const extension = getFileExtension(file.name);
    if (extension === "pdf" && !hasCanvasPdfEnvelope(file.base64)) {
      submittedFiles.push({ name: file.name, extension, mimeType: "application/pdf", previewContent: "PDF could not be read.", previewTruncated: false });
      unreadableFiles.push({ name: file.name, extension: "", mimeType: "application/x-canvas-attachment-unreadable", previewContent: "PDF could not be read.", previewTruncated: false });
      continue;
    }

    if (IMAGE_EXTENSIONS.has(extension) && !file.mimeType.trim().toLowerCase().startsWith("video/")) {
      const mimeType = GEMINI_IMAGE_MIME_TYPES.has(file.mimeType)
        ? file.mimeType
        : getMimeType(extension);
      if (!graderNeedsFileBytes(mimeType) || !GEMINI_IMAGE_MIME_TYPES.has(getMimeType(extension))) unreadableFiles.push({ name: file.name, extension: "", mimeType: "application/x-canvas-attachment-unreadable", previewContent: "Image format cannot be graded.", previewTruncated: false });
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

    if (extracted === null && !DOCUMENT_EXTENSIONS.has(extension) && !graderNeedsFileBytes(file.mimeType) && !file.mimeType.trim().toLowerCase().startsWith("video/") && !VIDEO_EXTENSIONS.has(extension)) {
      unreadableFiles.push({ name: file.name, extension: "", mimeType: "application/x-canvas-attachment-unreadable", previewContent: "Attachment could not be read.", previewTruncated: false });
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
        mimeType: extension === "pdf" ? "application/pdf" : file.mimeType,
      });
    } else {
      submittedFiles.push({
        name: file.name,
        extension,
        previewContent: "No extractable text available for this file.",
        previewTruncated: false,
        rawBase64: file.base64,
        mimeType: extension === "pdf" ? "application/pdf" : file.mimeType,
      });
    }
  }

  return {
    student: work.student,
    content: contentParts.join("\n\n---\n\n"),
    mergedFileCount: Math.max(1, work.files.length + (work.text ? 1 : 0)),
    submittedFiles: [...submittedFiles, ...unreadableFiles, ...(work.omittedVideos ?? []).map((video) => ({ name: video.name, extension: "mp4", mimeType: "video/mp4", previewContent: `Video unavailable: ${video.reason}.`, previewTruncated: false })), ...(work.omittedAttachments ?? []).map((file) => ({ name: file.name, extension: "", mimeType: "application/x-canvas-attachment-unavailable", previewContent: `Attachment unavailable: ${file.reason}.`, previewTruncated: false }))],
    userId: work.userId,
    submissionUrl: work.submissionUrl ?? null,
    repositoryInventories,
    gradedRepo,
    gradedRef,
    repoReadNote,
    ...(repoReadNote ? { linkFetch: gradedRepo ? "flagged" as const : "failed" as const } : {}),
  };
}
