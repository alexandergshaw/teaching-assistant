// The pure POSTING-CONTENT builders for "generate content from the
// instructor's LMS selection" (src/app/actions/lms-generation.ts) - split out
// of that file so it stays under this project's 1000-line ceiling. Everything
// here is I/O-free: given an already-generated (or already-re-read)
// GeneratedArtifact row, what Canvas-shaped content should
// postGeneratedArtifactAction hand to commit-plan.ts's planPostSteps? No
// Canvas call, no database read, no LLM call - those all stay in
// lms-generation.ts, which imports this file's exports rather than
// reimplementing them.
//
// DELIBERATELY A LEAF, the same rule commit-plan.ts and kinds.ts already
// document for themselves: no "@/app/actions" import, no Supabase import, no
// fetch. GenerationFailure is declared in kinds.ts (not lms-generation.ts)
// for exactly this reason - see that type's own doc comment.
import type { GeneratedArtifact } from "@/lib/supabase/generated-artifacts";
import type { PostContent } from "@/lib/lms-generation/commit-plan";
import type { GenerationFailure, KnowledgeCheckGeneratedQuestion } from "@/lib/lms-generation/kinds";
import { markdownLiteToHtml } from "@/lib/markdown-lite";

/**
 * Parse a knowledge-check artifact's `structured` column - or a raw LLM JSON
 * response's `questions` field - into the KnowledgeCheckGeneratedQuestion[]
 * it structurally resembles. Two call sites, two different trust levels:
 * postGeneratedArtifactAction's buildPostContentForKind (below) calls this on
 * `artifact.structured`, this app's own prior write (lms-generation.ts's
 * "knowledgeChecks" generation case in generateFromSelectionAction,
 * config.renderStructured, is the only writer of that column for this kind),
 * so light structural validation is enough there. lms-generation.ts's
 * refineGeneratedArtifactAction knowledgeChecks branch calls this on the
 * model's own revised-questions response (genuinely untrusted input) for
 * exactly the same reason: a malformed/empty entry must be dropped rather
 * than saved, never patched into something usable. Takes `unknown` rather
 * than `Json | null` so both callers (one holding a `Json | null` column
 * value, the other a `JSON.parse`d `unknown`) can use it without a cast.
 */
export function parseKnowledgeCheckStructured(structured: unknown): KnowledgeCheckGeneratedQuestion[] {
  if (!Array.isArray(structured)) return [];
  const candidates: unknown[] = structured;
  return candidates.filter((entry): entry is KnowledgeCheckGeneratedQuestion => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const q = entry as { prompt?: unknown; choices?: unknown };
    return typeof q.prompt === "string" && Array.isArray(q.choices);
  });
}

/** One generated knowledge-check question -> the Canvas quiz-question shape
 * createQuizQuestionAction accepts - mirrors steps.knowledge-checks.ts's own
 * inline mapping (that reference implementation's own name/text/type/points/
 * answers construction), not content-tab/utils.ts's quizQuestionToInput
 * (a CLIENT module operating on an EditableQuestion draft, not this shape -
 * see lms-generation.ts's own header comment on why that one is read only,
 * never imported). */
export function quizQuestionFromKnowledgeCheck(q: KnowledgeCheckGeneratedQuestion) {
  return {
    name: q.prompt.slice(0, 80),
    text: q.prompt,
    type: "multiple_choice_question" as const,
    points: 1,
    answers: q.choices.map((c) => ({ text: c.text, correct: c.correct })),
  };
}

/**
 * Build this kind's PostContent from an already-re-read artifact row - pure
 * given the row (no I/O), so every branch is a straight structural mapping.
 * `canvasObjectKind`'s four literals are exhaustively covered with no
 * `default`, the same "last statement in the function, TypeScript proves
 * exhaustiveness itself" pattern commit-plan.ts's own planPostSteps already
 * uses. The "quiz" branch is the only one that can itself fail (no usable
 * questions were ever saved on this version) - modelled as a return value,
 * never a throw, consistent with every other validation in lms-generation.ts.
 */
export function buildPostContentForKind(
  canvasObjectKind: "page" | "assignment" | "quiz" | "announcement",
  title: string,
  artifact: GeneratedArtifact,
  publishedOnCreation: boolean
): PostContent | GenerationFailure {
  switch (canvasObjectKind) {
    case "page":
      return { kind: "page", title, body: markdownLiteToHtml(artifact.text) };

    case "assignment":
      return {
        kind: "assignment",
        fields: {
          name: title,
          description: markdownLiteToHtml(artifact.text),
          pointsPossible: null,
          dueAt: "",
          submissionType: "online_text_entry",
          published: publishedOnCreation,
        },
      };

    case "quiz": {
      const questions = parseKnowledgeCheckStructured(artifact.structured);
      if (questions.length === 0) {
        return { error: "This version has no quiz questions saved to post - regenerate it first." };
      }
      return {
        kind: "quiz",
        title,
        description: "Check your understanding of this module's material. Review the explanations for any question you miss.",
        questions: questions.map(quizQuestionFromKnowledgeCheck),
      };
    }

    case "announcement":
      return { kind: "announcement", title, message: artifact.text };
  }
}
