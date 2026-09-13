"use server";

// Snapshot grading, WAVE 5 (docs/snapshot-grading-acceptance-criteria.md).
// THE READ PASS action (section 1, A1e). D (client-orchestrated): the
// caller (SnapshotGradingPanel.tsx) invokes this ONCE PER BATCH from an
// explicit `for await` loop in its click handler, never in a loop inside a
// single action - Vercel's 60s cap is per invocation, and one large
// multi-batch call would put N sequential vision calls under one budget.
//
// Section 6: the gate here is requireUser(), not requireOwner() - there is
// no owner-private data in this action, so the ordinary signed-in gate is
// correct (requireOwner() is a deliberately-less-restrictive deprecated
// alias that only delegates to requireUser() anyway; calling requireUser()
// directly says so instead of relying on an alias to say it for us).
//
// A7e/A7f: every shot's MIME is re-derived from its DECODED BYTES' magic
// number (never a client-supplied string), the batch is capped at this
// feature's OWN MAX_SHOTS (never GRADING_EXTRACT_BATCH_SIZE, a different
// feature's constant), and the wire-byte check runs against the ACTUAL
// encoded strings via sumBase64WireBytes/checkWireBudget before the model is
// ever called.

import { requireUser } from "@/lib/supabase/auth";
import { callLlm, describeLlmFailure, describeEmptyLlmText, type LlmProvider, type LlmPart } from "@/lib/llm";
import { checkWireBudget, sumBase64WireBytes } from "@/lib/upload-budget";
import { buildSnapshotReadPromptHeader, snapshotShotLabelLine } from "@/app/components/snapshot-grading/snapshot-read-prompt";
import { parseSnapshotReadResponse, detectImageMimeFromBase64, type SnapshotReadResult } from "@/app/components/snapshot-grading/snapshot-parse";
import { MAX_SHOTS } from "@/app/components/snapshot-grading/snapshot-shot";
import type { SnapshotReadBatchShotInput } from "@/app/components/snapshot-grading/snapshot-row";

export async function snapshotReadBatchAction(
  shots: SnapshotReadBatchShotInput[],
  provider: LlmProvider
): Promise<{ results: SnapshotReadResult[] } | { error: string }> {
  await requireUser();
  try {
    if (shots.length === 0) return { error: "No shots in this batch." };
    if (shots.length > MAX_SHOTS) return { error: "Too many shots in one read batch." };

    for (const shot of shots) {
      if (!detectImageMimeFromBase64(shot.base64)) {
        return { error: `Shot ${shot.globalIndex} is not a recognized image (jpeg/png/webp).` };
      }
    }

    const sizeCheck = checkWireBudget(sumBase64WireBytes(shots.map((s) => s.base64)), "This batch of shots");
    if (!sizeCheck.ok) return { error: sizeCheck.error ?? "This batch of shots is too large to read in one request." };

    const parts: LlmPart[] = [{ text: buildSnapshotReadPromptHeader() }];
    for (const shot of shots) {
      parts.push({ text: snapshotShotLabelLine(shot.globalIndex, shot.role, shot.note) });
      parts.push({ inlineData: { mimeType: "image/jpeg", data: shot.base64 } });
    }

    const r = await callLlm(
      { contents: [{ role: "user", parts }], generationConfig: { temperature: 0, maxOutputTokens: 4096 } },
      provider
    );

    if (!r.ok) return { error: describeLlmFailure(r, "Reading these shots failed") };
    if (!r.text.trim()) return { error: describeEmptyLlmText(r, "Reading these shots") };

    const results = parseSnapshotReadResponse(r.text);
    if (!results) return { error: "The read pass returned a response that could not be parsed." };
    return { results };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read these shots." };
  }
}
