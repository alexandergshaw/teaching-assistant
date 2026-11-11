import { restoreStaticTextEvidence } from "@/lib/grade/static-project-evidence";
import { MAX_STATIC_PROJECT_CONTENT_CHARS } from "@/lib/grade/static-project-limits";
import { pastedSubmissionUrl } from "@/lib/grade/pasted-submission-url";
import { isLengthDeductionThresholdWords } from "@/lib/grade/length-deduction-policy";
import { isSubmissionFileInventories } from "@/lib/grade/submission-file-inventory";
import { NextRequest, NextResponse } from "next/server";

import { requireAppOwner } from "@/lib/supabase/auth";
import { verifySingleZipOwnerSession } from "@/lib/supabase/single-zip-owner-session";
import { isExpectedOwnerSession } from "@/lib/grade/owner-session-binding";
import { normalizeProvider } from "@/lib/llm";
import { raceWithTimeout } from "@/lib/bounded-race";
import { gradeEntries } from "@/lib/grade/engine";
import { discussionAxesMatchContent } from "@/lib/grade/discussion-axes-consistency";
import { resolveEntryLinks } from "@/lib/grade/extraction";
import { VIDEO_EXTENSIONS, VIDEO_GRADING_ENABLED } from "@/lib/grade/constants";
import { isVideoName } from "@/lib/grade/video-grading";
import { OMITTED_CANVAS_ATTACHMENT_MIME, UNREADABLE_CANVAS_ATTACHMENT_MIME, safeCanvasLabel } from "@/lib/canvas/omitted-video";
import { videoFilesOf, videoRefsOwnedBy, withEntryVideos, type VideoSeamDeps } from "@/lib/grade/video-grade-seam";
import { createGeminiFilesClient } from "@/lib/gemini-files";
import { getGeminiApiKey, getGeminiModel, getGeminiMaxCharsPerSubmission } from "@/lib/gemini";
import {
  buildGradeItemDiagnostic,
  createGradeCallSink,
  type GradeItemDiagnostic,
} from "@/lib/grade/grade-item-diagnostic";
import type { GradeFailureClass } from "@/lib/grade/grade-failure";
import { downloadFile, removeFiles } from "@/lib/supabase/storage";
import { SYLLABUS_UPLOAD_BUCKET } from "@/lib/syllabus-upload-source";
import { coerceFeedbackWordTarget } from "@/lib/grade/types";
import { isRecordingWindow, type RecordingWindow } from "@/lib/grade/recording-split";
import { isDocumentVisuals } from "@/lib/grade/document-visual-schema";
import type { GradeHarshness, StudentSubmissionEntry, SubmittedFileInfo } from "@/lib/grade/types";
import {
  ITEM_REQUEST_BYTE_BUDGET,
  estimateNeededWireBytes,
} from "@/app/components/grading/incrementalRunPlan";

// A39 wave 4c (docs/a39-waves.md 8.4.3): one student's grading call, moved
// off the whole-run Server Action onto its own Route Handler so the client
// pool (useIncrementalGradingRun.ts) can hold several of these in flight at
// once and render each row as it lands, instead of one action awaiting a
// sequential loop with a fixed inter-request sleep and returning nothing
// until every student is done.
//
// Modelled line-for-line on src/app/api/class-trends-insight/route.ts for
// the maxDuration = 60 / soft-budget shape this handler copies rather than
// inventing its own.
//
// GUARD (security pass, docs/grading-chat-security.md finding F1): this
// route was originally gated with requireUser(), which admits ANY approved
// account, not only the owner. That let any authenticated non-owner spend
// the shared owner-configured GEMINI_API_KEY by POSTing straight to this
// route - a cost-abuse gap, since this handler calls the model on
// caller-supplied content. Tightened to requireAppOwner() (the real owner
// gate; requireOwner() is a deprecated alias that delegates to
// requireUser()). Confirmed safe: the only in-app caller is
// useIncrementalGradingRun.ts's postGradeRunItem, reached only after
// prepareGradingRunAction (already requireAppOwner()-gated) returns
// mode: "incremental" - and that path is itself gated off today by
// INCREMENTAL_ROUTE_ENABLED = false (incrementalRunPlan.ts), so no live
// flow depends on the looser guard.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// A SOFT work budget, not merely a declared ceiling. maxDuration only bounds
// what the PLATFORM allows before it kills the function - and that kill
// cannot be intercepted from in here, so it produces no response at all,
// not a worded error. The only way this handler can hand back a readable
// message instead of silence is to stop itself, on its own clock, before
// the platform's clock runs out. RULED (docs/a39-waves.md 8.4.3 step S2):
// follow class-trends-insight/route.ts's own numbers, not
// course-intel/ask/route.ts's 54_000 - both are named here so nobody
// invents a third.
const TOTAL_BUDGET_MS = 50_000;
const MODEL_WAIT_RESERVE_MS = 2_000;
// VIDEO-GRADING W3 (ops 7.2): download + sniff + Files upload + ACTIVE-wait gets
// at most this long; the rest of the budget is reserved for generateContent.
const VIDEO_PREPARE_BUDGET_MS = 25_000;

const MAX_RUBRIC_CHARS = 20_000;
const MAX_INSTRUCTIONS_CHARS = 20_000;
const MAX_STUDENT_CHARS = 500;
const MAX_CONTENT_CHARS = 2_000_000;
// BULK-ZIP BW3: bound on a submitted link URL; the SSRF allowlists live in the
// resolvers (resolveEntryLinks), so this boundary checks type and length only.
const MAX_URL_CHARS = 2048;

interface GradeRunItemRequestBody {
  expectedOwnerSession?: unknown;
  sourceIndex?: unknown;
  entry?: unknown;
  assignmentInstructions?: unknown;
  rubric?: unknown;
  provider?: unknown;
  pointsPossible?: unknown;
  commentSplit?: unknown;
  harshness?: unknown;
  feedbackWordTarget?: unknown;
  applyNamingDeduction?: unknown;
  applyLengthDeduction?: unknown;
  suppressLengthDeduction?: unknown;
  lengthDeductionThresholdWords?: unknown;
  gradeWindowSec?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * VIDEO-GRADING W2 (ops O-1, T14): a videoRef is exactly `{storagePath,
 * sizeBytes}` and nothing else - an extra key (a `fileUri`, a `url`) is a
 * client-forged provider handle and is refused. The path SHAPE is checked
 * against the caller's id where the ref is consumed, not here.
 */
function isVideoRef(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes("storagePath") || !keys.includes("sizeBytes")) return false;
  if (typeof value.storagePath !== "string" || value.storagePath.length === 0 || value.storagePath.length > MAX_URL_CHARS) {
    return false;
  }
  return typeof value.sizeBytes === "number" && Number.isFinite(value.sizeBytes) && value.sizeBytes >= 0;
}

function isSubmittedFileInfo(value: unknown): value is SubmittedFileInfo {
  if (!isRecord(value)) return false;
  if (typeof value.name !== "string" || typeof value.extension !== "string") return false;
  if (typeof value.previewContent !== "string" || typeof value.previewTruncated !== "boolean") return false;
  if (value.rawBase64 !== undefined && typeof value.rawBase64 !== "string") return false;
  if (value.staticTextMarker !== undefined && typeof value.staticTextMarker !== "string") return false;
  if (value.mimeType !== undefined && typeof value.mimeType !== "string") return false;
  if (value.documentVisuals !== undefined && !isDocumentVisuals(value.documentVisuals)) return false;
  if ((value.extension === "docx" || value.extension === "pptx") && value.documentVisuals?.status === "unavailable") return false;
  if (value.documentVisuals !== undefined && value.extension !== "docx" && value.extension !== "pptx" && value.documentVisuals.status !== "unavailable") return false;
  if (value.videoRef !== undefined) {
    // A video entry carries videoRef, NEVER rawBase64 (T14).
    if (value.rawBase64 !== undefined) return false;
    if (!isVideoRef(value.videoRef)) return false;
  }
  return true;
}

/**
 * Untrusted-input validation (S1's third guard, docs/a39-waves.md 8.4.3):
 * `entry` and `ticket` fields arrive from the client and are spent on a
 * model call, so every field is checked here rather than destructured and
 * trusted. Returns null on ANY malformed field - the caller responds 400,
 * never lets a malformed body reach gradeEntries.
 */
function partialEvidenceInstructions(instructions: string, entry: StudentSubmissionEntry): string {
  const notes: string[] = [];
  if (entry.staticOnly) notes.push("Code was not executed. Runtime behavior is unverified; do not claim that the program was run or that its output was observed.");
  if (entry.evidenceOmissions?.length) notes.push("Files were excluded from the submitted evidence. Evidence is incomplete; do not infer their contents or penalize the student for their absence.");
  return notes.length ? `${instructions}\n\n${notes.join(" ")}` : instructions;
}

function parseRequestBody(body: GradeRunItemRequestBody): {
  sourceIndex: number;
  entry: StudentSubmissionEntry;
  assignmentInstructions: string;
  rubric: string;
  provider: ReturnType<typeof normalizeProvider>;
  pointsPossible: number | null;
  commentSplit: boolean;
  harshness: GradeHarshness;
  feedbackWordTarget: number | undefined;
  applyNamingDeduction: boolean;
  applyLengthDeduction: boolean;
  suppressLengthDeduction: boolean;
  lengthDeductionThresholdWords: number | undefined;
  videoGradeWindowSec: RecordingWindow | undefined;
} | null {
  if (Object.hasOwn(body, "suppressLengthDeduction") && typeof body.suppressLengthDeduction !== "boolean") return null;
  if (body.suppressLengthDeduction === true && body.applyLengthDeduction === true) return null;
  if (Object.hasOwn(body, "lengthDeductionThresholdWords") && !isLengthDeductionThresholdWords(body.lengthDeductionThresholdWords)) return null;
  if (typeof body.sourceIndex !== "number" || !Number.isInteger(body.sourceIndex) || body.sourceIndex < 0) {
    return null;
  }
  if (!isRecord(body.entry)) return null;
  const rawEntry = body.entry;
  if (typeof rawEntry.student !== "string" || rawEntry.student.length === 0 || rawEntry.student.length > MAX_STUDENT_CHARS) {
    return null;
  }
  if (typeof rawEntry.content !== "string" || rawEntry.content.length > (rawEntry.staticOnly === true ? MAX_STATIC_PROJECT_CONTENT_CHARS : MAX_CONTENT_CHARS)) return null;
  if (typeof rawEntry.mergedFileCount !== "number") return null;
  if (
    rawEntry.submissionUrl !== undefined &&
    rawEntry.submissionUrl !== null &&
    (typeof rawEntry.submissionUrl !== "string" || rawEntry.submissionUrl.length > MAX_URL_CHARS)
  ) {
    return null;
  }
  if (rawEntry.staticOnly !== undefined && rawEntry.staticOnly !== true) return null;
  if (rawEntry.evidenceOmissions !== undefined && (!Array.isArray(rawEntry.evidenceOmissions) || rawEntry.evidenceOmissions.length < 1 || rawEntry.evidenceOmissions.length > 1000 || rawEntry.evidenceOmissions.some((path: unknown) => typeof path !== "string" || !path || path.length > 4096) || JSON.stringify(rawEntry.evidenceOmissions).length > 100000)) return null;
  if (!Array.isArray(rawEntry.submittedFiles) || !rawEntry.submittedFiles.every(isSubmittedFileInfo)) return null;

  if (rawEntry.repositoryInventories !== undefined && !isSubmissionFileInventories(rawEntry.repositoryInventories)) return null;

  const axes = rawEntry.discussionAxes;
  if (axes !== undefined && (
    !isRecord(axes) ||
    (axes.initialPostAbsentConfirmed !== undefined && axes.initialPostAbsentConfirmed !== true) ||
    typeof axes.initialPostContent !== "string" || axes.initialPostContent.length > MAX_CONTENT_CHARS ||
    typeof axes.replyContent !== "string" || axes.replyContent.length > MAX_CONTENT_CHARS ||
    typeof axes.replyCount !== "number" || !Number.isSafeInteger(axes.replyCount) || axes.replyCount < 0 ||
    (axes.replyCount === 0) !== (axes.replyContent.trim().length === 0)
  )) return null;
  if (axes !== undefined && !discussionAxesMatchContent(rawEntry.content, axes as NonNullable<StudentSubmissionEntry["discussionAxes"]>)) return null;
  if (axes !== undefined) {
    const reviewedAxes = axes as NonNullable<StudentSubmissionEntry["discussionAxes"]>;
    const limit = getGeminiMaxCharsPerSubmission();
    if (rawEntry.content.length > limit || reviewedAxes.initialPostContent.length > limit || reviewedAxes.replyContent.length > limit) return null;
  }

  const entry: StudentSubmissionEntry = {
    ...(axes !== undefined ? { discussionAxes: axes as NonNullable<StudentSubmissionEntry["discussionAxes"]> } : {}),
    ...(rawEntry.repositoryInventories !== undefined ? { repositoryInventories: rawEntry.repositoryInventories as StudentSubmissionEntry["repositoryInventories"] } : {}),
    ...(rawEntry.staticOnly === true ? { staticOnly: true as const } : {}),
    ...(rawEntry.evidenceOmissions !== undefined ? { evidenceOmissions: rawEntry.evidenceOmissions as string[] } : {}),
    student: rawEntry.student,
    content: rawEntry.content,
    mergedFileCount: rawEntry.mergedFileCount,
    submittedFiles: rawEntry.submittedFiles as SubmittedFileInfo[],
    userId: typeof rawEntry.userId === "number" ? rawEntry.userId : undefined,
    gradedRepo: typeof rawEntry.gradedRepo === "string" ? rawEntry.gradedRepo : undefined,
    gradedRef: typeof rawEntry.gradedRef === "string" ? rawEntry.gradedRef : undefined,
    submissionUrl: typeof rawEntry.submissionUrl === "string" ? rawEntry.submissionUrl : undefined,
    repoReadNote: typeof rawEntry.repoReadNote === "string" ? rawEntry.repoReadNote : undefined,
    linkFetch:
      rawEntry.linkFetch === "ok" || rawEntry.linkFetch === "failed" || rawEntry.linkFetch === "flagged"
        ? rawEntry.linkFetch
        : undefined,
  };

  if (estimateNeededWireBytes(entry) > ITEM_REQUEST_BYTE_BUDGET) return null;
  const restored = restoreStaticTextEvidence(entry); if (!restored) return null;
  if ((entry.discussionAxes || entry.submittedFiles.some(f => f.documentVisuals)) && new TextEncoder().encode(JSON.stringify(body)).byteLength > ITEM_REQUEST_BYTE_BUDGET) return null;

  if (typeof body.assignmentInstructions !== "string" || body.assignmentInstructions.length > MAX_INSTRUCTIONS_CHARS) {
    return null;
  }
  if (typeof body.rubric !== "string" || body.rubric.length > MAX_RUBRIC_CHARS) return null;
  if (body.pointsPossible !== null && typeof body.pointsPossible !== "number") return null;
  // RECORDING ONE-VS-MANY W3: absent = grade the whole recording; present but
  // malformed is refused, never silently widened to the whole recording.
  const rawWindow = body.gradeWindowSec;
  let videoGradeWindowSec: RecordingWindow | undefined;
  if (rawWindow !== undefined) {
    if (!isRecordingWindow(rawWindow)) return null;
    videoGradeWindowSec = { startSec: rawWindow.startSec, endSec: rawWindow.endSec };
  }

  return {
    sourceIndex: body.sourceIndex,
    entry: restored,
    assignmentInstructions: body.assignmentInstructions,
    rubric: body.rubric,
    provider: normalizeProvider(typeof body.provider === "string" ? body.provider : undefined),
    pointsPossible: body.pointsPossible,
    // Only a literal true opts in; anything else is the default mapping.
    commentSplit: body.commentSplit === true,
    // Default-safe: only a literal "lenient" or "strict" passes through; an
    // absent or invalid value resolves to "balanced" (no directive).
    harshness: body.harshness === "lenient" || body.harshness === "strict" ? body.harshness : "balanced",
    // Untrusted wire value: coerced to an in-range integer or undefined (unset,
    // no directive). Never trusted as sent.
    feedbackWordTarget: coerceFeedbackWordTarget(body.feedbackWordTarget),
    // Default-safe, default ON: only a literal false turns the file-name
    // deduction off; an absent or invalid value keeps today's behavior.
    applyNamingDeduction: body.applyNamingDeduction !== false,
    // Default-safe, default OFF: only a literal true turns the length deduction
    // on; an absent or invalid value keeps today's prompt.
    applyLengthDeduction: body.applyLengthDeduction === true,
    suppressLengthDeduction: body.suppressLengthDeduction === true,
    lengthDeductionThresholdWords: body.lengthDeductionThresholdWords as number | undefined,
    videoGradeWindowSec,
  };
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : "an unexpected error";
}

/** The owner-set model name, or undefined. Never throws (a diagnostic must not
 *  be able to fail a grade). */
function safeModelName(): string | undefined {
  try {
    return getGeminiModel();
  } catch {
    return undefined;
  }
}

/** The seam's real Storage + Files deps. Built only on the flagged video path. */
function buildVideoSeamDeps(): VideoSeamDeps {
  return {
    download: async (storagePath) => {
      const { data, error } = await downloadFile(SYLLABUS_UPLOAD_BUCKET, storagePath);
      return error || !data ? null : data;
    },
    removeObjects: async (paths) => {
      await removeFiles(SYLLABUS_UPLOAD_BUCKET, paths);
    },
    filesClient: createGeminiFilesClient({ apiKey: getGeminiApiKey() }),
  };
}

function videoFailureStatus(failure: string): number {
  if (failure === "too large" || failure === "unsupported format") return 422;
  if (failure === "timed out") return 504;
  return 502;
}

export async function POST(req: NextRequest) {
  const startedAtMs = Date.now();

  // AUTH ORDER (S1 check 1): requireAppOwner() before anything else, before
  // the body is even read - matching class-trends-insight/route.ts:96-100's
  // ordering (that route's own guard choice is unrelated; see this file's
  // header for why THIS route needs the owner gate specifically).
  try {
    await requireAppOwner();
  } catch (err) {
    return NextResponse.json({ error: describeError(err) }, { status: 401 });
  }

  // CSRF FLOOR (S1 check 2), before the body is parsed: a cross-origin HTML
  // form cannot produce this header, and a cross-origin fetch that sets it
  // triggers a preflight this app answers with no CORS headers. Same read
  // as parse-calendar/route.ts:14, prose/route.ts:20, research/route.ts:30.
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return NextResponse.json({ error: "Expected a JSON request body." }, { status: 400 });
  }

  let rawBody: GradeRunItemRequestBody;
  try {
    rawBody = (await req.json()) as GradeRunItemRequestBody;
  } catch {
    return NextResponse.json({ error: "Could not read the request." }, { status: 400 });
  }

  const parsed = parseRequestBody(rawBody);
  if (!parsed) {
    return NextResponse.json({ error: "This submission could not be read." }, { status: 400 });
  }
  const { sourceIndex, entry, assignmentInstructions, rubric, provider, pointsPossible, commentSplit, harshness, feedbackWordTarget, applyNamingDeduction, applyLengthDeduction, suppressLengthDeduction, lengthDeductionThresholdWords, videoGradeWindowSec } = parsed;
  const includesIndexEvidence = entry.submittedFiles.some((file) => /brightspace-index-evidence\.txt$/i.test(file.name));
  if ((rawBody.expectedOwnerSession !== undefined || includesIndexEvidence) && (!isExpectedOwnerSession(rawBody.expectedOwnerSession) || !await verifySingleZipOwnerSession(rawBody.expectedOwnerSession))) return NextResponse.json({ error: "The owner session changed. Nothing was graded." }, { status: 401 });

  // VIDEO-GRADING W3 (T11): dark behind VIDEO_GRADING_ENABLED. With the flag on,
  // a videoRef must name an object in THIS caller's own grading-uploads
  // namespace; a foreign-user path is refused before any Storage call.
  const videoMode = VIDEO_GRADING_ENABLED && videoFilesOf(entry).length > 0;
  let videoOwnerId = "";
  if (videoMode) {
    const owner = await requireAppOwner();
    videoOwnerId = owner.id;
    if (!videoRefsOwnedBy(videoOwnerId, entry)) {
      return NextResponse.json({ error: "This submission could not be read." }, { status: 400 });
    }
  }
  // Aborted at the route's own deadline: raceWithTimeout cannot cancel its
  // loser (ops O-4), so this is what makes the Files API cleanup fire.
  const videoAbort = new AbortController();

  // Chat-grading diagnostics WA: an ADDITIVE `diagnostic` key on the response.
  // Old clients read only body.result / body.error and never see it. The sink
  // is total and the builder takes numbers and closed-union members only, so
  // nothing here can change a grade, a status or an error string.
  const callSink = createGradeCallSink();
  let gradeStartedAtMs: number | undefined;
  const diagnosticFor = (failure?: GradeFailureClass): { diagnostic?: GradeItemDiagnostic } => {
    try {
      const nowMs = Date.now();
      const diagnostic = buildGradeItemDiagnostic({
        serverMs: nowMs - startedAtMs,
        prepMs: gradeStartedAtMs === undefined ? undefined : gradeStartedAtMs - startedAtMs,
        gradeMs: gradeStartedAtMs === undefined ? undefined : nowMs - gradeStartedAtMs,
        model: safeModelName(),
        calls: callSink.calls,
        ...callSink.visuals,
        failure: failure ?? callSink.failure,
      });
      return { diagnostic };
    } catch {
      return {};
    }
  };

  // THE SOFT BUDGET IS UNDER THE HARD CAP (S1 check 3): TOTAL_BUDGET_MS is
  // strictly below maxDuration * 1000, so this handler stops itself, on its
  // own clock, with a worded response, before the platform kills it silently.
  const remainingMs = startedAtMs + TOTAL_BUDGET_MS - Date.now();
  const waitMs = Math.max(1_000, remainingMs - MODEL_WAIT_RESERVE_MS);

  try {
    // No generateRubric call and no fetchCanvasMeta call here - the ticket
    // already carries the shared rubric and instructions this run's prep
    // step (prepareGradingRunAction) resolved ONCE, up front. Repeating
    // either per item would reproduce the grading.ts:634-636 defect this
    // seam exists to avoid (W4-4).
    // BULK-ZIP BW3: a link submission (entry.submissionUrl) is resolved HERE,
    // per item, inside the same soft budget as the grade. resolveEntryLinks
    // never throws and re-clamps the folded content.
    const outcome = await raceWithTimeout(
      (async () => {
        const pastedLink = !!entry.submissionUrl && pastedSubmissionUrl(entry.content) === entry.submissionUrl;
        const archiveLink = entry.content.includes("Submitted link:") && entry.submittedFiles.some((file) => /\.html?$/i.test(file.name));
        if (archiveLink && !entry.submissionUrl) return { unavailablePastedLink: true };
        const archiveUrls = archiveLink ? [...entry.content.matchAll(/(?:^|\n)Submitted link:\s*(\S+)/g)].map((match) => match[1]) : [];
        if (archiveLink && (!archiveUrls.length || archiveUrls.some((url) => url !== entry.submissionUrl))) return { unavailablePastedLink: true };
        const needsLink = pastedLink || (archiveLink && !!entry.submissionUrl);
        if (needsLink) {
          const url = new URL(entry.submissionUrl!);
          if (url.username || url.password) return { unavailablePastedLink: true };
        }
        const resolved = await resolveEntryLinks(needsLink ? { ...entry, gradedRepo: null, gradedRef: null, repoReadNote: null, linkFetch: undefined } : entry);
        if (needsLink && (resolved.linkFetch === "failed" || resolved.linkFetch === "flagged" || (resolved.content === entry.content && resolved.submittedFiles.length === entry.submittedFiles.length))) return { unavailablePastedLink: true };
        const unreadableAttachment = resolved.submittedFiles.find((file) => file.mimeType === UNREADABLE_CANVAS_ATTACHMENT_MIME);
        if (unreadableAttachment) return { unreadableAttachment: { name: unreadableAttachment.name } };
        const omittedAttachment = resolved.submittedFiles.find((file) => file.mimeType === OMITTED_CANVAS_ATTACHMENT_MIME);
        if (omittedAttachment) return { omittedAttachment: { name: omittedAttachment.name } };
        const unhandledStagedVideo = !videoMode && videoFilesOf(resolved)[0];
        if (unhandledStagedVideo) return { videoUnavailable: { name: unhandledStagedVideo.name } };
        const unavailableVideo = resolved.submittedFiles.find((file) =>
          (isVideoName(file.name) || VIDEO_EXTENSIONS.has(file.extension.trim().toLowerCase().replace(/^\./, "")) || (file.mimeType ?? "").split(";", 1)[0].trim().toLowerCase().startsWith("video/")) && !file.videoRef
        );
        if (unavailableVideo) return { unavailableVideo: { name: unavailableVideo.name } };
        if (videoMode) {
          const options = { commentSplit, harshness, feedbackWordTarget, applyNamingDeduction, applyLengthDeduction, suppressLengthDeduction, lengthDeductionThresholdWords, callSink, ...(entry.staticOnly ? { autoRunCode: false } : {}), ...(videoGradeWindowSec ? { videoGradeWindowSec } : {}) };
          const videoOutcome = await withEntryVideos(
            buildVideoSeamDeps(),
            { userId: videoOwnerId, uploadDeadlineMs: startedAtMs + VIDEO_PREPARE_BUDGET_MS, signal: videoAbort.signal },
            resolved,
            (extraAttachments) => {
              gradeStartedAtMs = Date.now();
              return gradeEntries([resolved], partialEvidenceInstructions(assignmentInstructions, resolved), rubric, provider, pointsPossible, { ...options, extraAttachments });
            },
            (run) => Boolean(videoGradeWindowSec) || run.results[0]?.ungraded?.kind === "grading-failed"
          );
          if (!videoOutcome.ok) return { videoFailure: { failure: videoOutcome.failure, message: videoOutcome.message } };
          return { graded: videoOutcome.value, linkFetch: resolved.linkFetch };
        }
        gradeStartedAtMs = Date.now();
        const graded = await gradeEntries([resolved], partialEvidenceInstructions(assignmentInstructions, resolved), rubric, provider, pointsPossible, { commentSplit, harshness, feedbackWordTarget, applyNamingDeduction, applyLengthDeduction, suppressLengthDeduction, lengthDeductionThresholdWords, callSink, ...(entry.staticOnly ? { autoRunCode: false } : {}), ...(videoGradeWindowSec ? { videoGradeWindowSec } : {}) });
        return { graded, linkFetch: resolved.linkFetch };
      })(),
      waitMs
    );

    if (outcome.kind === "timedout") {
      videoAbort.abort();
      return NextResponse.json(
        { error: "This submission did not finish grading in time. It was not graded.", ...diagnosticFor("route budget") },
        { status: 504 }
      );
    }
    if (outcome.kind === "failed") {
      return NextResponse.json({ error: describeError(outcome.error), ...diagnosticFor("route error") }, { status: 502 });
    }

    if (outcome.value.unavailablePastedLink) return NextResponse.json({ error: "The linked submission could not be read completely. Check access or upload its contents directly; no grade was produced.", ...diagnosticFor("route error") }, { status: 422 });
    if (outcome.value.unreadableAttachment) {
      return NextResponse.json({ error: `Attachment "${safeCanvasLabel(outcome.value.unreadableAttachment.name)}" could not be read. No grade was produced.`, ...diagnosticFor("route error") }, { status: 422 });
    }
    if (outcome.value.omittedAttachment) {
      return NextResponse.json({ error: `Attachment "${safeCanvasLabel(outcome.value.omittedAttachment.name)}" could not be downloaded. No grade was produced.`, ...diagnosticFor("route error") }, { status: 422 });
    }
    if (outcome.value.videoUnavailable) {
      return NextResponse.json(
        { error: `Video "${safeCanvasLabel(outcome.value.videoUnavailable.name)}" cannot be graded while video grading is unavailable. No grade was produced.`, ...diagnosticFor("route error") },
        { status: 422 }
      );
    }
    if (outcome.value.unavailableVideo) {
      return NextResponse.json(
        { error: `Video "${safeCanvasLabel(outcome.value.unavailableVideo.name)}" could not be prepared for grading. Download it and upload it directly in grading chat.`, ...diagnosticFor("route error") },
        { status: 422 }
      );
    }
    const videoFailure = outcome.value.videoFailure;
    if (videoFailure) {
      return NextResponse.json(
        { error: videoFailure.message, videoFailure: videoFailure.failure, ...diagnosticFor("route error") },
        { status: videoFailureStatus(videoFailure.failure) }
      );
    }
    if (!outcome.value.graded) return NextResponse.json({ error: "an unexpected error" }, { status: 502 });
    const result = outcome.value.graded.results[0];
    return NextResponse.json({ sourceIndex, result: { ...result, linkFetch: outcome.value.linkFetch, ...(entry.evidenceOmissions?.length ? { evidenceOmissions: entry.evidenceOmissions } : {}), ...(entry.staticOnly ? { staticOnly: true } : {}) }, ...diagnosticFor() });
  } catch (err) {
    return NextResponse.json({ error: describeError(err), ...diagnosticFor("route error") }, { status: 502 });
  }
}
