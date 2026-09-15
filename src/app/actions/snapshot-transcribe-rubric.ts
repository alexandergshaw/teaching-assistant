"use server";

// Snapshot grading, N14 WAVE 2 (Ruling N14-15, scratchpad/n14-architecture.md
// section 3). THE OCR ACTION for the Alt+R rubric-capture chord - a NEW
// dedicated action, not a synthesised one-element call into
// snapshotReadBatchAction: that action is built around tray shots, a
// per-shot label line, and this feature's OWN MAX_SHOTS bound, none of which
// this path enters (the captured frame never reaches addShot/addEncodedShot
// - Criterion 3 point 2). Modelled on snapshot-read.ts's shape, simplified to
// exactly one image with no batch, no label, and no structured JSON parse -
// the response is one plain transcript string.
//
// requireUser(), not requireOwner(): no owner-private data here either, same
// reasoning as snapshot-read.ts.
//
// Wire-budget: checked here with checkWireBudget DIRECTLY (never trust the
// client-side pre-flight alone), with the label "This screen capture" - NOT
// checkShotWireBudget, whose hardcoded "This shot" label is wrong for a frame
// that deliberately never becomes a shot (Ruling N14-18 / architecture
// section 3, minor fix).

import { requireUser } from "@/lib/supabase/auth";
import { callLlm, describeLlmFailure, describeEmptyLlmText, type LlmProvider } from "@/lib/llm";
import { checkWireBudget } from "@/lib/upload-budget";
import { buildRubricCapturePrompt } from "@/app/components/snapshot-grading/snapshot-rubric-capture-prompt";
import { detectImageMimeFromBase64 } from "@/app/components/snapshot-grading/snapshot-parse";

export async function snapshotTranscribeRubricAction(
  base64: string,
  provider: LlmProvider
): Promise<{ text: string } | { error: string }> {
  await requireUser();
  try {
    if (!base64.trim()) return { error: "No screen capture was provided." };

    if (!detectImageMimeFromBase64(base64)) {
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
              { text: buildRubricCapturePrompt() },
              { inlineData: { mimeType: "image/jpeg", data: base64 } },
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
