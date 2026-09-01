"use server";

// Server action for grading-via-recording's SCORING step
// (docs/grading-via-recording-acceptance-criteria.md sections 0 and 3).
//
// R0-2/R0-3: this action produces the feature's own row-shaped result -
// { id, totalScore, strengths, improvements, overallComment, failed } - never
// a GradeResult (no `student`, no `userId`, no `rubricAreas`, no `feedback`).
// `failed` (FIX 2) is a real boolean discriminator, not derived from prose -
// see grading-feedback-prompt.ts's GradingRecordingFeedback for where it is
// set and grading-rows.ts's classifyGradingResult for the one place it is
// read.
// It never calls gradeEntries/gradeStudentEntries (src/lib/grade/engine.ts),
// which exists to produce a postable result carrying a userId - the exact
// thing R0-2 rules out here structurally. It only reuses the pure grading
// FUNCTIONS, via grading-feedback-prompt.ts's leaf (which itself reuses
// buildSystemPrompt, parseRubricResponse, composeOverallComment,
// scaleResultToPoints and RESUBMIT_NOTICE from src/lib/grade/*). Nothing
// here writes to grading_drafts or any other persisted grading store, and no
// student id of any kind is ever constructed, read, or threaded through -
// `submissions` carries only an opaque row `id` (grading-row.ts's own,
// minted client-side, never a Canvas id) plus the two strings read off the
// screen.
//
// BATCHING: one LLM call PER SUBMISSION, in a sequential loop - the SAME
// shape gradeStudentEntries (engine.ts) already uses for its own per-student
// loop, and the opposite of runDraftLoop's (discussion-draft-loop.ts)
// up-to-5-posts-per-call batching. Chosen because runDraftLoop's own failure
// handling shows exactly the cost of batching a grading call: a batch call
// that errors marks EVERY unresolved item in that batch failed with the SAME
// error string (see its `if ("error" in result)` branch), and there is no
// way to tell whether the whole batch failed for a reason specific to one
// bad submission or a reason that would have affected all of them anyway.
// Feedback here is text a student will read; a batched failure whose real
// cause was one submission's illegible handwriting or a malformed screen
// capture should not read as "something went wrong" on nine other students'
// rows too, and a partially-parseable batch response has no clean way to
// attribute which submission the parseable part belonged to. One call per
// submission means a single bad submission's failure is caught by its OWN
// try/catch (below) and produces its OWN verbatim error via
// composeFailedGradingRow, while every other submission's grading proceeds
// completely unaffected. The cost - N sequential LLM calls instead of
// ceil(N/5) - is accepted for the same reason gradeStudentEntries already
// pays it on the zip/Canvas paths: correctness and attribution over raw
// throughput for a grading result a student reads and may appeal.
//
// SCALE: getGeminiMaxSubmissions()/getGeminiInterRequestDelayMs() are the
// SAME shared knobs gradeStudentEntries reads (src/lib/gemini.ts) - reused
// here for the same reason they exist there: this repo's production
// deployment is Vercel Hobby with a 60s function cap, and an unbounded
// sequential-call loop is exactly what would blow through it on a large
// capture session. Submissions beyond the cap are not silently dropped (the
// way gradeStudentEntries' own `.slice(0, maxSubmissions)` is silent,
// because its caller owns the whole result list) - each excess submission
// still gets its own row back, via composeFailedGradingRow, naming the limit
// and telling the instructor to retry it on its own, so no row is left
// wedged in "grading" forever.

import { requireOwner } from "@/lib/supabase/auth";
import { callLlm, describeLlmFailure, describeEmptyLlmText, type LlmProvider, type LlmPart } from "@/lib/llm";
import { getGeminiMaxSubmissions, getGeminiInterRequestDelayMs, getGeminiMaxOutputTokens } from "@/lib/gemini";
import { sleep } from "@/lib/grade/utils";
import {
  buildGradingRecordingSystemPrompt,
  buildGradingRecordingPrompt,
  composeGradingRowResult,
  composeFailedGradingRow,
  type GradingRecordingFeedback,
} from "@/app/components/grading-recording/grading-feedback-prompt";

// Second, hard backstop on the already-framed, already-capped (10000 chars -
// DEFAULT_KNOWLEDGE_CONTEXT_MAX_CHARS in src/lib/chat/knowledge-context.ts)
// knowledge-context text this action receives over the Server Action wire -
// mirrors discussion-replies.ts's own MAX_KNOWLEDGE_CONTEXT_CHARS (20000)
// exactly, at double the upstream budget so it never fires against a real
// launch and only guards a malformed/oversized wire payload. Deliberately
// NOT re-applied to a normal launch's text: the anti-injection framing
// header this feature must reuse verbatim is far shorter than either
// budget, so a truncation this generous can never cut into it in practice -
// see buildGradingRecordingPrompt's own header for why the header itself is
// never reformatted or re-wrapped here regardless.
const MAX_KNOWLEDGE_CONTEXT_CHARS = 20000;

function coerceKnowledgeContextAtBoundary(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > MAX_KNOWLEDGE_CONTEXT_CHARS
    ? `${trimmed.slice(0, MAX_KNOWLEDGE_CONTEXT_CHARS)}\n\n[Knowledge Base context truncated - it was too long to include in full.]`
    : trimmed;
}

/**
 * Grade a batch of submissions captured off a screen recording against a
 * pasted/uploaded rubric, optionally with instructor-selected knowledge-base
 * context. Never binds a score to a student record and never posts
 * anywhere - see this file's own header and grading-row.ts's R0-2 account.
 *
 * NOT YET WIRED TO A PRODUCTION CALLER: this action has no caller in this
 * change. It is built to be called by the panel/table layer a sibling file
 * set owns (GradingRecordingPanel.tsx / GradingTable*.tsx / useGradingRows.ts
 * under src/app/components/grading-recording/, per this task's own file-lane
 * split) once a batch of GradingRow entries is ready to grade - see this
 * file's own report for the explicit statement of what is and is not
 * reachable today.
 */
export async function gradeCapturedSubmissionsAction(
  submissions: ReadonlyArray<{ id: string; studentName: string; submissionText: string }>,
  rubricText: string,
  knowledgeContext: string | undefined,
  provider: LlmProvider
): Promise<
  | { results: Array<{ id: string } & GradingRecordingFeedback> }
  | { error: string }
> {
  try {
    await requireOwner();

    if (submissions.length === 0) return { error: "No submissions to grade." };
    if (!rubricText.trim()) return { error: "A rubric is required before grading." };

    const maxSubmissions = getGeminiMaxSubmissions();
    const interRequestDelayMs = getGeminiInterRequestDelayMs();
    const maxOutputTokens = getGeminiMaxOutputTokens();
    const safeKnowledgeContext = coerceKnowledgeContextAtBoundary(knowledgeContext);

    const toGrade = submissions.slice(0, maxSubmissions);
    const overflow = submissions.slice(maxSubmissions);

    const systemPrompt = buildGradingRecordingSystemPrompt(rubricText);
    const results: Array<{ id: string } & GradingRecordingFeedback> = [];

    for (let i = 0; i < toGrade.length; i += 1) {
      const submission = toGrade[i];

      try {
        const prompt = buildGradingRecordingPrompt(
          systemPrompt,
          submission.studentName,
          submission.submissionText,
          safeKnowledgeContext
        );
        const parts: LlmPart[] = [{ text: prompt }];

        const r = await callLlm(
          { contents: [{ role: "user", parts }], generationConfig: { temperature: 0.2, maxOutputTokens } },
          provider
        );

        if (!r.ok) {
          results.push({ id: submission.id, ...composeFailedGradingRow(describeLlmFailure(r, "Grading this submission failed")) });
        } else if (!r.text.trim()) {
          results.push({ id: submission.id, ...composeFailedGradingRow(describeEmptyLlmText(r, "Grading this submission")) });
        } else {
          results.push({ id: submission.id, ...composeGradingRowResult(r.text) });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not grade this submission.";
        results.push({ id: submission.id, ...composeFailedGradingRow(message) });
      }

      if (interRequestDelayMs > 0 && i < toGrade.length - 1) {
        await sleep(interRequestDelayMs);
      }
    }

    for (const submission of overflow) {
      results.push({
        id: submission.id,
        ...composeFailedGradingRow(
          `Too many submissions in one grading run (limit ${maxSubmissions}). Retry this row on its own.`
        ),
      });
    }

    return { results };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not grade these submissions." };
  }
}
