// RECORDING ONE-VS-MANY W1 (docs/recording-one-vs-many-scope.md section 3.1): the
// server seam. ONE model classification call over an uploaded video, with the
// Files upload bracketed and deleted - it reuses withEntryVideos (ownership
// re-check, size re-check, magic-byte sniff, bracket) so the lifecycle is the one
// the grade path already proves. Pure of Next and Supabase: Storage, the Files
// client and the model arrive as injected deps, so it runs against fakes.
//
// RULED RETURN CONTRACT: { split, failed? }. `failed: true` is a TRANSPORT flag,
// not a member of RecordingSplit. A classifier error, a not-ok model result or an
// unreadable answer returns { split: { kind: "single" }, failed: true } - the
// grade still falls back to one submission, but the caller can tell that apart
// from a model-confirmed single ({ split: { kind: "single" } }, failed ABSENT).
// This function never throws.
import type { LlmRequest, LlmResult } from "../llm";
import type { StudentSubmissionEntry, VideoRef } from "./types";
import { buildRecordingSplitPrompt, parseRecordingSplit, type RecordingSplit } from "./recording-split";
import { withEntryVideos, type VideoSeamContext, type VideoSeamDeps } from "./video-grade-seam";

export interface RecordingSplitDeps extends VideoSeamDeps {
  readonly callLlm: (req: LlmRequest) => Promise<LlmResult>;
}

export interface ClassifyRecordingResult {
  split: RecordingSplit;
  failed?: true;
}

export interface ClassifyRecordingInput {
  readonly videoRef: VideoRef;
  readonly assignmentInstructions: string;
  readonly rubric: string;
}

const MAX_OUTPUT_TOKENS = 2048;

function failedSingle(): ClassifyRecordingResult {
  return { split: { kind: "single" }, failed: true };
}

/** A one-video entry shaped for the shared bracket; its content is never shown. */
function classifyEntry(videoRef: VideoRef): StudentSubmissionEntry {
  return {
    student: "recording",
    content: "",
    mergedFileCount: 1,
    submittedFiles: [
      {
        name: "recording",
        extension: "",
        previewContent: "",
        previewTruncated: false,
        videoRef,
      },
    ],
  };
}

export async function classifyRecording(
  deps: RecordingSplitDeps,
  ctx: VideoSeamContext,
  input: ClassifyRecordingInput
): Promise<ClassifyRecordingResult> {
  const prompt = buildRecordingSplitPrompt(input.assignmentInstructions, input.rubric);
  try {
    const outcome = await withEntryVideos(
      deps,
      ctx,
      classifyEntry(input.videoRef),
      async (attachments): Promise<ClassifyRecordingResult> => {
        const result = await deps.callLlm({
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                ...attachments.map((a) =>
                  "fileUri" in a
                    ? { fileData: { fileUri: a.fileUri, mimeType: a.mimeType } }
                    : { inlineData: { mimeType: a.mimeType, data: a.base64 } }
                ),
              ],
            },
          ],
          generationConfig: { temperature: 0, maxOutputTokens: MAX_OUTPUT_TOKENS, responseMimeType: "application/json" },
        });
        if (!result.ok) return failedSingle();
        const parsed = parseRecordingSplit(result.text);
        if (!parsed.confident) return failedSingle();
        return { split: parsed.split };
      },
      // The Storage object belongs to the grade request that follows: never
      // remove it on a successful classification.
      () => true
    );
    return outcome.ok ? outcome.value : failedSingle();
  } catch {
    return failedSingle();
  }
}
