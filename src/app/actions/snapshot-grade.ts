"use server";

// Snapshot grading, WAVE 5 (docs/snapshot-grading-acceptance-criteria.md).
// THE GRADE PASS action (section 1, A3, PIPELINE SHAPE build S3). Receives
// the instructor-edited transcription (A1f) AND the shots (per the owner's
// build decision, so the model can re-look at a rubric table the read pass
// flattened badly), and returns a parsed, cited answer.
//
// A1e's measured fallback: before this call sums the ACTUAL encoded shot
// strings and, if they exceed GRADE_PASS_IMAGE_BUDGET_BYTES, includes shots
// in role priority (rubric, assignment, work) until spent - everything past
// that point still has its TRANSCRIPTION sent (transcriptBlock always
// covers every shot), only its image is dropped. The caller renders
// `imageFallbackNote` in the same block as the score.
//
// Section 6: requireUser(), not requireOwner() - no owner-private data here.
// A7e/A7f: same magic-number MIME re-derivation and wire-byte check as the
// read pass, run again here since this action never trusts state the read
// pass already validated (a fresh request, a fresh validation).

import { requireUser } from "@/lib/supabase/auth";
import { callLlm, describeLlmFailure, describeEmptyLlmText, type LlmPart } from "@/lib/llm";
import { checkWireBudget, sumBase64WireBytes } from "@/lib/upload-budget";
import { extractRubricCriteria } from "@/lib/grade/rubric";
import { buildSnapshotGradeSystemPrompt } from "@/app/components/snapshot-grading/snapshot-grade-prompt";
import { parseSnapshotGradeResponse, detectImageMimeFromBase64, type SnapshotGradeAnswer } from "@/app/components/snapshot-grading/snapshot-parse";
import { selectShotsForGradeCall, type SnapshotGradeRequestInput } from "@/app/components/snapshot-grading/snapshot-row";

interface SnapshotGradeActionResult {
  answer: SnapshotGradeAnswer;
  /** Set when the image budget cut some shots' images from this call - see
   *  this file's own header. Rendered next to the score, never buried. */
  imageFallbackNote?: string;
  /** BLOCKER 1 fix: the rubric areas `extractRubricCriteria` actually
   *  derived from `rubricText`, returned so the caller can show the
   *  instructor exactly what got pinned into the grading prompt's "you MUST
   *  return exactly one rubricResults item for each required area listed
   *  above... do not omit areas" instruction (prompts.ts:38). A prose rubric
   *  that this parser only partially recognizes (see this file's own
   *  extractRubricCriteria call below) silently pins the model to the
   *  recognized areas ONLY and tells it to omit the rest - there is no other
   *  channel that reveals this, because `criteria` was never returned before
   *  this fix. Empty when no rubric text was supplied, or when none of it
   *  parsed as `Name (N pts):`-shaped criteria - the caller renders these two
   *  empty cases distinctly from each other (no rubric text at all, vs.
   *  rubric text that failed to parse), since only the latter is the model
   *  choosing its own areas because of a parse failure.
   */
  pinnedRubricAreas: { name: string; points: number | null }[];
}

export async function snapshotGradeAction(
  request: SnapshotGradeRequestInput,
  /** H1-D: instructor-authored grading guidance, typed directly into this
   *  app - a different trust class from `assignmentText`/`rubricText`, which
   *  can also carry text copied from captured work material. Optional
   *  second parameter rather than a field on `SnapshotGradeRequestInput`
   *  (shared with the read pass via snapshot-row.ts) so this feature's own
   *  files stay the only ones touched by this change. Threaded straight into
   *  buildSnapshotGradeSystemPrompt below - see that file for how it is
   *  framed and how GRADE_PRECEDENCE_CLAUSE scopes it. */
  instructorInstructions?: string
): Promise<SnapshotGradeActionResult | { error: string }> {
  await requireUser();
  try {
    const { shots, transcriptBlock, provider, assignmentText, rubricText } = request;

    if (shots.length === 0 && !transcriptBlock.trim()) {
      // H1-A: this only ever fires when there is truly nothing at all (no
      // shots AND no transcript) - Read is not required before Grade, so the
      // message must not imply it is.
      return { error: "There is nothing to grade yet - add at least one shot to the tray." };
    }

    // Derived HERE, not on the client: extractRubricCriteria reaches
    // node:crypto via ../research/rubric-bank, and the panel that builds
    // this request is "use client". Matches grading-feedback-prompt.ts's own
    // shape (criteria derived from the rubric text right before prompting).
    const criteria = extractRubricCriteria(rubricText);

    for (const shot of shots) {
      if (!detectImageMimeFromBase64(shot.base64)) {
        return { error: `Shot ${shot.globalIndex} is not a recognized image (jpeg/png/webp).` };
      }
    }

    const selection = selectShotsForGradeCall(shots);

    const parts: LlmPart[] = [
      { text: buildSnapshotGradeSystemPrompt(assignmentText, rubricText, criteria, instructorInstructions) },
      { text: `TRANSCRIPTION (role-labeled; the instructor may have corrected it before grading):\n${transcriptBlock}` },
    ];
    for (const shot of selection.included) {
      parts.push({ text: `Shot ${shot.globalIndex} image (role: ${shot.role}):` });
      parts.push({ inlineData: { mimeType: "image/jpeg", data: shot.base64 } });
    }

    const wireCheck = checkWireBudget(
      sumBase64WireBytes(selection.included.map((s) => s.base64)),
      "This grading request"
    );
    if (!wireCheck.ok) return { error: wireCheck.error ?? "This grading request is too large to send in one call." };

    const r = await callLlm(
      {
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0, maxOutputTokens: 4096, responseMimeType: "application/json" },
      },
      provider
    );

    if (!r.ok) return { error: describeLlmFailure(r, "Grading failed") };
    if (!r.text.trim()) return { error: describeEmptyLlmText(r, "Grading") };

    const answer = parseSnapshotGradeResponse(r.text);
    if (!answer) return { error: "The grade pass returned a response that could not be parsed." };

    return {
      answer,
      imageFallbackNote: selection.fallbackNote,
      pinnedRubricAreas: criteria.map((c) => ({ name: c.name, points: c.points })),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not grade this session." };
  }
}
