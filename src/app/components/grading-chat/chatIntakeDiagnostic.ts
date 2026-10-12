// Intake diagnostics for the chat grading view (CHAT-GRADING-DETAILED-DIAGNOSTICS
// WE, docs/chat-grading-detailed-diagnostics-scope.md 4.2 C/D, AC-14, AC-15).
// Records the intake facts that were previously dropped silently: the transport
// chosen, the size bucket, why a refusal happened (the server's typed class),
// the session-cap clip or refusal, and the recording split decision.
//
// BROWSER-ONLY: it writes to the session diagnostic log, so no server path may
// import it (session-diagnostic-log.test.ts bans the log module from api/ and
// actions/). The PURE half (extension bucket, size bucket, gate description) is
// exported for tests; the recorders are thin and every call site wraps them in
// safeIntake so diagnostics can never change an intake outcome.
//
// NO STUDENT DATA. Every value is a number, a boolean or a member of a closed
// union. A file NAME is read only to derive the extension bucket and is never
// stored; the recorded `error` is one of the fixed seam classes.
import { recordSessionDiagnosticEntry } from "@/lib/session-diagnostic-log";
import { detectCanvasUrlKind } from "@/lib/canvas-url";
import type { IngestLedger } from "@/lib/grade/ndjson-ingest-parser";
import type { ChatSubmissionInput, IntakeOutcome } from "./chatSubmissionIntake";
import { singleFileExtension, SINGLE_FILE_STORAGE_EXTENSIONS } from "@/lib/grade/grading-zip-transport";
import { GRADING_DIAGNOSTIC_OPERATION_LABELS } from "@/app/components/grading/gradingDiagnosticLog";
import { chatSeamNowMs, classifyChatSeamFailure, decideChatSeamDiagnostic, type ChatSeamFailureClass, type ChatSeamOperation } from "./chatSeamDiagnostic";
import {
  buildAdmitSubmissionsDetail,
  buildPrepareSubmissionDetail,
  buildResolveRecordingSplitDetail,
  type AdmitSubmissionsSignals,
  type ChatDetailBag,
  type IntakeExt,
  type IntakeInputKind,
  type IntakeStage,
  type IntakeTransport,
  type PrepareSubmissionSignals,
  type ResolveRecordingSplitSignals,
} from "./chatGradeDetail";

const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp"]);

/** Diagnostics must never change an intake outcome: any throw here is swallowed. */
export function safeIntake(fn: () => void): void {
  try {
    fn();
  } catch {
    // Deliberately empty.
  }
}

/** PURE. The extension as a member of the closed bucket list, else "other". The
 * name is read, never returned. */
export function intakeExtBucket(file: { readonly name: string }): IntakeExt {
  const ext = singleFileExtension(file.name);
  if (ext === "zip") return "zip";
  if (ext === "pdf") return "pdf";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (SINGLE_FILE_STORAGE_EXTENSIONS.has(ext)) return "text";
  return "other";
}

/** PURE. Whole kilobytes, rounded up so a non-empty file is never 0. */
export function intakeSizeKb(bytes: number): number {
  return Number.isFinite(bytes) && bytes > 0 ? Math.ceil(bytes / 1024) : 0;
}

/** PURE. The gate facts for one picked file: the transport chosen, its size and
 * its extension bucket. Never the name. */
export function describeIntakeGate(
  file: { readonly name: string; readonly size: number },
  transport: "body" | "storage" | "refused"
): { transport?: IntakeTransport; sizeKb: number; ext: IntakeExt } {
  const facts = { sizeKb: intakeSizeKb(file.size), ext: intakeExtBucket(file) };
  return transport === "refused" ? facts : { transport, ...facts };
}

const INPUT_KIND_OF: Readonly<Record<ChatSubmissionInput["kind"], IntakeInputKind>> = {
  text: "text",
  file: "file",
  url: "url",
  composite: "composite",
  "storaged-zip": "zip-storage",
  "storaged-file": "file-storage",
  "storaged-video": "video-storage",
};

/** PURE. The prepare_submission signals for one server intake outcome: the input
 * kind and its coarse shape, then either the typed refusal or the entry counts.
 * Reads names only to count them; none is returned. */
export function intakeSignalsFor(input: ChatSubmissionInput, outcome: IntakeOutcome): PrepareSubmissionSignals {
  const signals: PrepareSubmissionSignals = { inputKind: INPUT_KIND_OF[input.kind], stage: "prepare" };
  if (input.kind === "file") {
    signals.sizeKb = intakeSizeKb(input.file.size);
    signals.ext = intakeExtBucket(input.file);
    signals.transport = "body";
  } else if (input.kind === "url") {
    signals.urlKind = detectCanvasUrlKind(input.url) !== null ? "canvas" : "other";
  } else if (input.kind === "composite") {
    signals.parts = input.parts.length;
  }
  if (outcome.kind === "refused") {
    if (outcome.refusalClass !== undefined) signals.refusal = outcome.refusalClass;
    return signals;
  }
  signals.entries = outcome.entries.length;
  signals.chars = outcome.entries.reduce((sum, entry) => sum + entry.content.length, 0);
  signals.files = outcome.entries.reduce((sum, entry) => sum + entry.submittedFiles.length, 0);
  const source = (kind: "filename" | "inferred" | "unresolved") => outcome.entries.filter((entry) => entry.studentNameSource === kind).length;
  signals.namesFilename = source("filename");
  signals.namesInferred = source("inferred");
  signals.namesUnresolved = source("unresolved");
  if (outcome.classification) signals.markers = outcome.classification.markerStudentCount;
  return signals;
}

/** PURE. The prepare_submission signals for a storaged zip's ledger (counts only;
 * the skipped students' NAMES and the failed files' names are never read). */
export function ledgerSignals(ledger: IngestLedger): PrepareSubmissionSignals {
  return {
    inputKind: "zip-storage",
    stage: "prepare",
    transport: "storage",
    found: ledger.studentsFound,
    emitted: ledger.studentsEmitted,
    skipped: ledger.skipped.length,
    failedFiles: ledger.failedSupportedFiles.length,
    ...(ledger.classification ? { markers: ledger.classification.markerStudentCount } : {}),
  };
}

function recordIntake(
  operation: ChatSeamOperation,
  startedAtMs: number | null,
  failureClass: ChatSeamFailureClass | null,
  detail: ChatDetailBag
): void {
  const decision = decideChatSeamDiagnostic({ operation, startedAtMs, settledAtMs: chatSeamNowMs(), failureClass });
  if (!decision) return;
  recordSessionDiagnosticEntry({
    at: new Date().toISOString(),
    surface: "grading",
    operation: decision.operation,
    label: GRADING_DIAGNOSTIC_OPERATION_LABELS[decision.operation as keyof typeof GRADING_DIAGNOSTIC_OPERATION_LABELS],
    outcome: decision.outcome,
    durationMs: decision.durationMs,
    error: decision.error,
    detail,
  });
}

/** prepare_submission with its intake detail. `rawReason` is only classified,
 * never stored; pass null for a success. */
export function recordPrepareDetail(args: {
  startedAtMs: number | null;
  rawReason: string | null;
  signals: PrepareSubmissionSignals;
}): void {
  const failureClass = args.rawReason === null ? null : classifyChatSeamFailure(args.rawReason);
  recordIntake("prepare_submission", args.startedAtMs, failureClass, buildPrepareSubmissionDetail(args.signals));
}

/** A panel gate that stopped a file before the driver saw it (transport or
 * preflight refusal, or a failed storage upload). Always a failure entry. */
export function recordIntakeGate(args: {
  stage: Extract<IntakeStage, "gate" | "upload">;
  file: { readonly name: string; readonly size: number };
  transport: "body" | "storage" | "refused";
  rawReason: string;
}): void {
  const started = chatSeamNowMs();
  const gate = describeIntakeGate(args.file, args.transport);
  recordIntake(
    "prepare_submission",
    started,
    classifyChatSeamFailure(args.rawReason),
    buildPrepareSubmissionDetail({ inputKind: "file", stage: args.stage, ...gate })
  );
}

/** admit_submissions: called ONLY when the cap refused outright, clipped a
 * batch, a zip skipped students, or a zip held nothing. Never on a clean admit. */
export function recordAdmitAnomaly(args: { failureClass: ChatSeamFailureClass | null; signals: AdmitSubmissionsSignals }): void {
  recordIntake("admit_submissions", chatSeamNowMs(), args.failureClass, buildAdmitSubmissionsDetail(args.signals));
}

/** resolve_recording_split: the instructor's confirm or reject decision. */
export function recordSplitDecision(signals: ResolveRecordingSplitSignals): void {
  recordIntake("resolve_recording_split", chatSeamNowMs(), null, buildResolveRecordingSplitDetail(signals));
}
