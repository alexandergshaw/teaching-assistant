// RECORDING ONE-VS-MANY W2/W3 (docs/recording-one-vs-many-scope.md sections 3.2,
// 3.3): the plain, testable leaf behind the driver's storaged-video branch.
// Kept out of useContinuousGradingRun.ts so the logic that needs a test is not
// stuck in a hook and the driver stays well under the file-size ceiling.
//
//  - classifyVideoEntry: ONE classify call for the prepared video entry, with
//    the counts-only client diagnostic recorded from the { split, failed }
//    response. Never throws; any failure is the fail-safe single.
//  - buildSplitEntries: the N per-segment entries from the ONE stored video.
//    DISTINCTNESS is NOT decided here: the driver pushes every entry through
//    its existing assignUnclaimedLabel + taken-set admit loop, which is what
//    keeps two segments from collapsing onto one gradebook row.
//
// BROWSER-ONLY: imports the browser diagnostic recorder.
import type { StudentSubmissionEntry } from "@/lib/grade/types";
import type { RecordingSegment, RecordingSplit, RecordingWindow } from "@/lib/grade/recording-split";
import { recordClassifyRecordingSettled } from "@/app/components/grading/gradingDiagnosticLog";
import { chatSeamNowMs } from "./chatSeamDiagnostic";
import type { ClassifyRecordingFn } from "./videoClient";

/** A multi-submission recording held until the instructor confirms or declines. */
export interface PendingSplit {
  /** The ONE prepared whole-video entry (its videoRef is shared by every segment). */
  readonly entry: StudentSubmissionEntry;
  readonly segments: readonly RecordingSegment[];
  /** The uploaded file's name, for the confirm card. */
  readonly name: string;
  /** The submit-time label, applied only if the instructor grades it as one. */
  readonly label: string;
}

/** The first videoRef on the entry, or null (a text/zip entry has none). */
export function videoRefOf(entry: StudentSubmissionEntry): { storagePath: string; sizeBytes: number } | null {
  for (const file of entry.submittedFiles) {
    if (file.videoRef !== undefined) return { storagePath: file.videoRef.storagePath, sizeBytes: file.videoRef.sizeBytes };
  }
  return null;
}

/**
 * Classifies one prepared video entry. A missing videoRef, a thrown classifier
 * or a `failed` response all yield { kind: "single" }: the recording is graded
 * as one submission exactly as it is today. Records the counts-only diagnostic.
 */
export async function classifyVideoEntry(args: {
  readonly classify: ClassifyRecordingFn;
  readonly entry: StudentSubmissionEntry;
  readonly assignmentInstructions: string;
  readonly rubric: string;
}): Promise<RecordingSplit> {
  const ref = videoRefOf(args.entry);
  if (ref === null) return { kind: "single" };
  const startedAtMs = chatSeamNowMs();
  let split: RecordingSplit = { kind: "single" };
  let failed = false;
  try {
    const outcome = await args.classify({
      storagePath: ref.storagePath,
      sizeBytes: ref.sizeBytes,
      assignmentInstructions: args.assignmentInstructions,
      rubric: args.rubric,
    });
    split = outcome.failed ? { kind: "single" } : outcome.split;
    failed = outcome.failed;
  } catch {
    // postClassifyRecording never throws; this guards an injected replacement.
    failed = true;
  }
  recordClassifyRecordingSettled({
    startedAtMs,
    settledAtMs: chatSeamNowMs(),
    split,
    failed,
    at: new Date().toISOString(),
  });
  return split;
}

/**
 * N entries from the ONE stored video, one per segment: same submittedFiles
 * (so the same videoRef), the segment label as the tentative student, and the
 * segment's window in a parallel array (index-aligned with `entries`).
 */
export function buildSplitEntries(pending: PendingSplit): {
  entries: StudentSubmissionEntry[];
  windows: RecordingWindow[];
} {
  const entries = pending.segments.map(
    (segment): StudentSubmissionEntry => ({
      ...pending.entry,
      student: segment.label,
      // The name came from the recording, not a typed label: never "unresolved".
      studentNameSource: "inferred",
    })
  );
  const windows = pending.segments.map((segment): RecordingWindow => ({ startSec: segment.startSec, endSec: segment.endSec }));
  return { entries, windows };
}
