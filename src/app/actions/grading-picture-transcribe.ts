"use server";

// N15-2 (docs/n15-waves-1-2-test-notes.md; N14's snapshot-transcribe-rubric.ts
// is the template this mirrors). THE OCR ACTION generalized to accept a
// `kind` (rubric or assignment description) so one action serves both
// picture-transcription flows. Same shape as the template - one image, no
// batch, no label, no structured JSON parse - the response is one plain
// transcript string.
//
// requireUser(), not requireOwner(): no owner-private data here either, same
// reasoning as the template.
//
// TRAP-3A fix (the template's live defect at snapshot-transcribe-rubric.ts:50):
// the inlineData mimeType MUST be the value detectImageMimeFromBase64 already
// computed to pass the recognized-image gate, never a hardcoded "image/jpeg" -
// otherwise a PNG or webp capture would ride the wire mislabeled.

import { requireUser } from "@/lib/supabase/auth";
import { callLlm, describeLlmFailure, describeEmptyLlmText, type LlmProvider } from "@/lib/llm";
import { checkWireBudget } from "@/lib/upload-budget";
import { buildRubricPicturePrompt, type RubricPictureKind } from "@/lib/grade/rubric-picture-prompt";
import { detectImageMimeFromBase64 } from "@/app/components/snapshot-grading/snapshot-parse";

export async function transcribeGradingPictureAction(
  base64: string,
  kind: RubricPictureKind,
  provider: LlmProvider
): Promise<{ text: string } | { error: string }> {
  await requireUser();
  try {
    if (!base64.trim()) return { error: "No screen capture was provided." };

    // Computed ONCE: refuses a non-image payload here (R2.6) and is reused,
    // unaltered, as the inlineData mimeType below (R2.2) - one computation,
    // both requirements, so the two can never drift apart.
    const mime = detectImageMimeFromBase64(base64);
    if (!mime) {
      return { error: "This screen capture is not a recognized image (jpeg/png/webp)." };
    }

    const sizeCheck = checkWireBudget(base64.length, "This screen capture");
    if (!sizeCheck.ok) return { error: sizeCheck.error ?? "This screen capture is too large to transcribe in one request." };

    const r = await callLlm(
      {
        contents: [
          {
            role: "user",
            parts: [
              { text: buildRubricPicturePrompt(kind) },
              { inlineData: { mimeType: mime, data: base64 } },
            ],
          },
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 4096 },
      },
      provider
    );

    if (!r.ok) return { error: describeLlmFailure(r, "Transcribing this rubric capture failed") };
    if (!r.text.trim()) return { error: describeEmptyLlmText(r, "Transcribing this rubric capture") };

    return { text: r.text.trim() };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not transcribe this screen capture." };
  }
}
