// VIDEO-GRADING W4: the browser-side seams of the grading chat's video path,
// as plain testable leaves (no component is ever rendered under vitest).
//
//  - VideoGradeError: what the grade POST throws when /api/grade-run-item
//    answers with a typed `videoFailure`, so the driver can record the class
//    (never parsed from message text, ops O-7) while the row still carries the
//    worded message.
//  - postPrepareVideo: the default `prepareVideo`, POST /api/grade-submission-video.
//  - submitLooseVideo: the loose single / loose multi path. decideVideoTransport
//    FIRST (its wording is right for a video; the zip preflight's is not), then
//    the direct-to-Storage upload, then the driver's `storaged-video` submit.
//
// BROWSER-ONLY: imports the browser diagnostics recorder.
import type { StudentSubmissionEntry } from "@/lib/grade/types";
import { readRecordingSplitResponse, type RecordingSplit } from "@/lib/grade/recording-split";
import { deleteGradingZipBestEffort, type GradingZipStorage } from "@/lib/grade/grading-zip-transport";
import { isVideoFailureClass, type VideoFailureClass } from "@/lib/grade/video-failure";
import { decideVideoTransport, uploadGradingVideo, type GradingVideoUploadResult } from "@/lib/grade/video-transport";
import type { ChatSubmissionInput } from "./chatSubmissionIntake";
import { chatSeamNowMs } from "./chatSeamDiagnostic";
import { recordVideoSettled } from "./videoDiagnostic";

/** Thrown by the grade POST for a typed video failure. */
export class VideoGradeError extends Error {
  readonly videoFailure: VideoFailureClass;
  constructor(message: string, videoFailure: VideoFailureClass) {
    super(message);
    this.name = "VideoGradeError";
    this.videoFailure = videoFailure;
  }
}

/** The typed video failure carried by an error, or null. */
export function videoFailureOf(err: unknown): VideoFailureClass | null {
  if (err instanceof VideoGradeError) return err.videoFailure;
  return null;
}

/** Builds the error a failed grade POST should throw from its JSON body. */
export function gradeFailureFromBody(body: { error?: unknown; videoFailure?: unknown }): Error {
  const message = typeof body.error === "string" && body.error.length > 0 ? body.error : "The grading service did not respond.";
  return isVideoFailureClass(body.videoFailure) ? new VideoGradeError(message, body.videoFailure) : new Error(message);
}

export type PrepareVideoOutcome =
  | { readonly kind: "entry"; readonly entry: StudentSubmissionEntry }
  | { readonly kind: "refused"; readonly reason: string; readonly videoFailure: VideoFailureClass };

export type PrepareVideoFn = (storagePath: string, name: string, label?: string) => Promise<PrepareVideoOutcome>;

/** The default `prepareVideo`: POST /api/grade-submission-video. Never throws. */
export const postPrepareVideo: PrepareVideoFn = async (storagePath, name, label) => {
  try {
    const res = await fetch("/api/grade-submission-video", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ storagePath, name, ...(label ? { label } : {}) }),
    });
    const body = (await res.json().catch(() => ({}))) as { entry?: StudentSubmissionEntry; error?: unknown; videoFailure?: unknown };
    if (res.ok && body.entry) return { kind: "entry", entry: body.entry };
    const failure = isVideoFailureClass(body.videoFailure) ? body.videoFailure : "upload failed";
    const reason = typeof body.error === "string" && body.error.length > 0 ? body.error : "The video could not be prepared.";
    return { kind: "refused", reason, videoFailure: failure };
  } catch {
    return { kind: "refused", reason: "The video could not be prepared.", videoFailure: "upload failed" };
  }
};

/** What the driver needs from the classifier: the (always valid) split, and
 * whether it is the error-fallback single (`failed`, a transport flag). */
export type ClassifyRecordingOutcome = { readonly split: RecordingSplit; readonly failed: boolean };

export type ClassifyRecordingFn = (args: {
  readonly storagePath: string;
  readonly sizeBytes: number;
  readonly assignmentInstructions: string;
  readonly rubric: string;
}) => Promise<ClassifyRecordingOutcome>;

/** The default `classifyRecording`: POST /api/classify-recording. Never throws;
 * any transport or shape problem is { single, failed: true } (grade as one). */
export const postClassifyRecording: ClassifyRecordingFn = async (args) => {
  try {
    const res = await fetch("/api/classify-recording", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(args),
    });
    if (!res.ok) return { split: { kind: "single" }, failed: true };
    return readRecordingSplitResponse(await res.json().catch(() => null));
  } catch {
    return { split: { kind: "single" }, failed: true };
  }
};

type DriverSubmit = (input: ChatSubmissionInput) => Promise<
  { readonly kind: "accepted"; readonly entryCount: number } | { readonly kind: "refused"; readonly reason: string } | { readonly kind: "partial"; readonly dispatchedCount: number; readonly refusedCount: number; readonly reason: string }
>;

export interface SubmitLooseVideoArgs {
  readonly file: File;
  readonly label?: string;
  readonly userId: string | null;
  readonly storage: GradingZipStorage;
  /** Loose videos staged and not yet graded (the driver's pendingVideoCount). */
  readonly pendingStaged: number;
  readonly enabled: boolean;
  /** Begins the grading session once for the batch; false = it was refused. */
  readonly ensureSession: () => Promise<boolean>;
  readonly sessionRefusal: () => string;
  readonly submit: DriverSubmit;
  /** Injected for tests; default is the real upload. */
  readonly upload?: (storage: GradingZipStorage, userId: string, file: File) => Promise<GradingVideoUploadResult>;
  readonly remove?: (storage: GradingZipStorage, storagePath: string) => Promise<void>;
}

type LooseVideoOutcome = Awaited<ReturnType<DriverSubmit>>;

/**
 * One loose video. Returns `null` when the file is not a video (the caller
 * proceeds down the existing zip/body path unchanged). A refusal uploads
 * nothing; a refused or thrown submit removes the staged object best-effort
 * (the orphan sweep is the real backstop).
 */
export async function submitLooseVideo(args: SubmitLooseVideoArgs): Promise<LooseVideoOutcome | null> {
  const startedAtMs = chatSeamNowMs();
  const settle = (failure: VideoFailureClass) =>
    recordVideoSettled({ startedAtMs, settledAtMs: chatSeamNowMs(), failure });

  const transport = decideVideoTransport(args.file, args.pendingStaged, args.enabled);
  if (transport.kind === "not-video") return null;
  if (transport.kind === "refused") {
    settle(transport.failure);
    return { kind: "refused", reason: transport.message };
  }

  if (!args.userId) {
    settle("upload failed");
    return { kind: "refused", reason: "You must be signed in to upload a video." };
  }
  if (!(await args.ensureSession())) return { kind: "refused", reason: args.sessionRefusal() };

  const upload = args.upload ?? uploadGradingVideo;
  const remove = args.remove ?? deleteGradingZipBestEffort;
  const uploaded = await upload(args.storage, args.userId, args.file);
  if (!uploaded.ok) {
    settle(uploaded.failure);
    return { kind: "refused", reason: uploaded.message };
  }
  try {
    const outcome = await args.submit({ kind: "storaged-video", storagePath: uploaded.storagePath, name: args.file.name, label: args.label });
    if (outcome.kind === "refused") await remove(args.storage, uploaded.storagePath);
    return outcome;
  } catch (err) {
    await remove(args.storage, uploaded.storagePath);
    throw err;
  }
}
