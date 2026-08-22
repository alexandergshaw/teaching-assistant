"use server";

// The extractor for the "visualizer coverage for the selection" bulk-bar row
// (docs/visualizer-coverage-from-selection-acceptance-criteria.md - this file
// is Contract 2). A "use server" module may only export async functions (see
// src/lib/use-server-exports.test.ts), so ScannedConcept - the type this
// action returns - is declared in Contract 1's pure leaf
// (src/lib/visualizer/selection-coverage.ts) and imported here as a type only.
//
// D2/D3 - WHY THIS IS A NEW ACTION, NOT A CALL TO extractDeckConceptsAction
// (src/app/actions/visualizer.ts): that action's prompt is framed "Below is a
// lecture slide deck", which is the wrong framing for an assignment/quiz/page
// selection, and - more importantly - it asks only for "teachable concepts",
// which would happily drag in this feature's selection's own submission
// instructions, grading rules, and admin policy right along with the concepts
// worth visualizing. This action's prompt instead asks specifically for
// concepts a student would understand BETTER from an interactive visual -
// state changes, control flow, data structures, algorithms, sequencing,
// transformations - and explicitly rejects the categories a visual would not
// help with (plain definitions, policies, admin/submission instructions,
// grading rules). parseDeckConcepts/clampDeckConcepts (deck-concepts.ts) ARE
// reused here regardless - they are pure JSON/line parsing and clamping, not
// deck-specific despite the file name, exactly as D3 calls for.
//
// THE NO-LLM (embedded) PATH - DELIBERATE CHOICE, NOT AN OVERSIGHT:
// extractDeckConceptsAction's own embedded fallback (conceptsFromSlideTitles)
// works because "does this line look like a slide title" is a STRUCTURAL
// question a regex can answer honestly. "Is this concept something a student
// would grasp better from an interactive visual, as opposed to a definition,
// a policy, or a grading rule" is not a structural question - it is exactly
// the judgment call D2 exists to make, and no deterministic heuristic over
// arbitrary assignment/quiz/page prose can make that call honestly. A regex
// that, say, treated every capitalized noun phrase as a "concept" would not
// fail loudly (returning [] and tripping the "silent empty list" alarm this
// repo already knows to watch for) - it would fail QUIETLY, by shipping a
// plausible-looking list that is actually just noise, which is worse: it
// looks like it worked. Rather than ship that, the embedded path here returns
// an honest, specific {error} - the same shape createVisualizerConceptAction
// already uses for its own "provider embedded" refusal ("Creating visualizer
// pages requires an LLM provider.") - so a caller sees a clear, actionable
// refusal instead of either a crash or a silently-wrong result.
import { requireOwner } from "@/lib/supabase/auth";
import { callLlm, describeLlmFailure, describeEmptyLlmText, type LlmProvider } from "@/lib/llm";
import { parseDeckConcepts, clampDeckConcepts } from "@/lib/workflows/deck-concepts";
import type { ScannedConcept } from "@/lib/visualizer/selection-coverage";

// Materials text is sliced to this many characters before being sent to the
// model, mirroring extractDeckConceptsAction's own DECK_TEXT_CHAR_CAP - a
// module selection's gathered materials can be long, and this keeps the
// prompt (and cost) bounded the same way.
const MATERIALS_TEXT_CHAR_CAP = 12000;

/**
 * Extract the concepts in a Modules selection's gathered materials that a
 * student would understand better from an interactive visual (D2). Provider
 * "embedded" refuses outright with a specific, honest error - see this
 * module's header comment for why a deterministic fallback is not offered
 * here. Otherwise calls the LLM once and distinguishes THREE distinct
 * degradations (SHOULD-FIX 4, A6 - "found nothing" must never render as
 * success, and a provider failure must never render as "nothing to
 * visualize"): the call itself failing (describeLlmFailure), the call
 * succeeding with an empty response (describeEmptyLlmText), and the call
 * succeeding with text that parses to zero concepts (this action's own
 * "nothing worth visualizing" message) - only the last of these means the
 * material genuinely had nothing worth visualizing.
 */
export async function extractVisualizationConceptsAction(
  materialsText: string,
  maxConcepts?: number,
  provider: LlmProvider = "gemini"
): Promise<{ concepts: ScannedConcept[] } | { error: string }> {
  try {
    await requireOwner();

    const trimmed = (materialsText ?? "").trim();
    if (!trimmed) {
      return { error: "Provide the selection's materials to analyze." };
    }

    const cap = clampDeckConcepts(maxConcepts);

    if (provider === "embedded") {
      return {
        error:
          "Extracting visualization-worthy concepts requires an LLM provider - judging which concepts a student would " +
          "grasp better from an interactive visual (as opposed to a definition, a policy, or an admin instruction) " +
          "cannot be done honestly from structure alone.",
      };
    }

    const prompt = `You are an expert programming instructor deciding which concepts in a course selection would benefit from an INTERACTIVE VISUAL - a small app a student can manipulate to see how something behaves, not a static picture.

ONLY list a concept if a student would understand it meaningfully better by seeing it animated, stepped through, or manipulated - for example:
- a STATE CHANGE (a variable's value changing over time, a data structure being mutated)
- CONTROL FLOW (branching, loops, recursion, conditional logic)
- a DATA STRUCTURE (how it is built, traversed, or organized in memory)
- an ALGORITHM (its steps, in order, and what changes at each step)
- SEQUENCING (the order operations happen in, especially when order matters)
- a TRANSFORMATION (data being converted from one shape or format to another)

NEVER list any of the following, even if they appear prominently in the material - a visual would not help with any of them:
- a plain DEFINITION or vocabulary term with nothing to animate
- a POLICY (grading policy, late-work policy, academic-integrity policy)
- an ADMIN or SUBMISSION INSTRUCTION (how/where/when to submit, file naming, formatting requirements)
- a GRADING RULE (point values, rubric criteria, weighting)

List up to ${cap} such concepts - the canonical name a learner would search for (for example "for loops", "recursion", "binary search", "hash tables"), NOT copied verbatim from the material. For each, quote the exact phrase or sentence from the material that shows the concept is actually covered there. Return ONLY valid JSON: {"concepts":[{"concept":"...","evidence":"..."}]} - no markdown fences, no commentary. If nothing in the material qualifies, return {"concepts":[]}.

SELECTION MATERIALS (the assignments, quizzes, pages, and files an instructor selected for this scan):
${trimmed.slice(0, MATERIALS_TEXT_CHAR_CAP)}`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
      },
      provider
    );

    // SHOULD-FIX 4: a provider FAILURE (bad key, 500, quota) must never be
    // reported the same way as a genuine "nothing worth visualizing" result -
    // A6 requires each degradation be specific and distinguishable, and
    // telling an instructor their material has nothing to visualize when the
    // provider actually failed is actively misleading. describeLlmFailure /
    // describeEmptyLlmText (src/lib/llm.ts) are the established, reused
    // formatters for exactly this split - see weekly-significance.ts,
    // textbook-research.ts, knowledge-check.ts, instructor-notes.ts,
    // lms-generation-refine.ts, github-content.ts, course-planning.ts for the
    // same three-way check this action now follows.
    if (!result.ok) {
      return { error: describeLlmFailure(result, "Visualization-concept extraction failed") };
    }
    if (!result.text.trim()) {
      return { error: describeEmptyLlmText(result, "Visualization-concept extraction failed") };
    }

    const concepts = parseDeckConcepts(result.text, cap);
    if (concepts.length === 0) {
      return { error: "Could not find any concepts in this material that would benefit from an interactive visual." };
    }

    return { concepts };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not extract visualization concepts from this material." };
  }
}
