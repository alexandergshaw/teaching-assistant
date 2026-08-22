import { courseKindContract, courseKindNoun, type CourseKind } from "@/lib/course-kind";
import { PLAIN_LANGUAGE_CONTRACT } from "@/lib/artifact-voice";
import { callLlm, type LlmProvider } from "@/lib/llm";
import { stripModelUrls } from "@/lib/urls";
import { toBullets, keyPhrases, ensureSentence, capitalizeFirst } from "@/lib/embedded/scaffold";

/**
 * gatherSelectionMaterials (src/lib/lms-generation/materials.ts) headers every
 * item's chunk one of two ways depending on its source: a live Page/File is
 * `# <title>\n<body>` (gatherLiveItem), an export-sourced item OR a live
 * Assignment/Quiz/Discussion is `<Type>: <title>\n<body>` (gatherExportItem /
 * gatherLiveItem's header-line branches), and a repo-sourced item is
 * `# <itemRef>\n<content>` (gatherRepoItem) - so either a markdown H1 or a
 * "Type: Title" line always names the item as Canvas (or the repo/export
 * source) itself names it. `<Type>` is drawn from the closed vocabulary
 * gatherLiveItem/gatherExportItem actually emit (Assignment, Quiz, Page,
 * File, Discussion - see materials.ts:226-278) - NOT any capitalized word,
 * so a materials body line that merely happens to look like "Word: rest"
 * (e.g. a "Note: submissions are due Friday." line from an item's own body
 * text) is never mistaken for a real item header and echoed back to the
 * student as something the instructor selected. This is the ONLY place that
 * header shape is relied on, and only to echo the selection's own item names
 * back to the student (D1/A7 point 1: "a course item the instructor actually
 * selected, named as it is named in Canvas") in the embedded scaffold below -
 * the LLM path instead reads the materials itself and is told the same
 * naming rule in the prompt (see generateLearningResourcesForSelection).
 */
const ITEM_HEADER_RE = /^(?:#\s+(.+)|(?:Assignment|Quiz|Page|File|Discussion):\s+(.+))$/;

function extractItemTitles(materialsText: string): string[] {
  const titles: string[] = [];
  for (const rawLine of materialsText.split(/\r?\n/)) {
    const match = ITEM_HEADER_RE.exec(rawLine.trim());
    if (!match) continue;
    const title = (match[1] ?? match[2])?.trim();
    if (title) titles.push(title);
  }
  return [...new Set(titles)];
}

/**
 * Materials text with every item-header line (matched by ITEM_HEADER_RE)
 * removed, so the "Concepts to Review" section (built from what's left) can
 * never simply repeat the "This Module's Items" section (built from the
 * header lines themselves) line for line (finding 3).
 */
function stripItemHeaderLines(materialsText: string): string {
  return materialsText
    .split(/\r?\n/)
    .filter((line) => !ITEM_HEADER_RE.test(line.trim()))
    .join("\n");
}

/** Strip a leading markdown heading marker a concept line might still carry
 * (toBullets' own stripMarker strips "-", "*", bullet, "1.", "a)" but not
 * "#" - see src/lib/embedded/scaffold.ts:98-99) so a concept never renders as
 * "- # Some Heading." (finding 3). */
function stripLeadingHeadingMarker(text: string): string {
  return text.replace(/^#+\s*/, "");
}

/**
 * Embedded Deterministic Engine scaffold for a Learning Resources page (A9).
 * No suitable scaffold already existed in @/lib/embedded/docs for this kind
 * (that module's scaffolds cover the module-intro/objectives/assignment
 * documents only), so this is a small deterministic one, written here rather
 * than there - following that module's own precedent
 * (scaffoldModuleObjectivesDoc's own doc comment: "the assignment is what
 * proves the objective... every bullet comes from the input verbatim").
 * Every line below is either a title pulled verbatim from the selection's own
 * item headers (extractItemTitles) or a phrase pulled verbatim from the
 * materials text (toBullets/keyPhrases) - nothing here is invented, and no
 * chapter number, video title, or author is ever fabricated. A materials
 * body CAN legitimately contain a URL (e.g. a live page's own body text
 * copied verbatim), so the caller (generateLearningResourcesForSelection)
 * runs this scaffold's output through stripModelUrls exactly as it does the
 * LLM path's output, rather than letting a copied-verbatim link reach a
 * posted page unfiltered (D1). The concepts source has every item-header
 * line stripped first (stripItemHeaderLines) so this section is never a
 * line-for-line repeat of the items section above it.
 */
function scaffoldLearningResourcesDoc(moduleLabel: string, materialsText: string): string {
  const items = extractItemTitles(materialsText);
  const concepts = toBullets(stripItemHeaderLines(materialsText)).slice(0, 5);
  const searchTerms = keyPhrases(materialsText, 6);

  const itemsSection =
    items.length > 0
      ? items
          .map((title) => `- ${title}: one of the items selected for this module - look it over before you start.`)
          .join("\n")
      : "- [List the items selected for this module]";

  const conceptsSection =
    concepts.length > 0
      ? concepts
          .map((concept) => `- ${ensureSentence(capitalizeFirst(stripLeadingHeadingMarker(concept)))}`)
          .join("\n")
      : "- [List a concept or skill worth reviewing before this module's work]";

  const searchSection =
    searchTerms.length > 0
      ? searchTerms.map((term) => `- "${term}"`).join("\n")
      : '- [Search terms a student could use to find outside material themselves]';

  return [
    `# Learning Resources: ${moduleLabel}`,
    ensureSentence(`Use this page to get ready for ${moduleLabel.toLowerCase()}`),
    "## This Module's Items",
    itemsSection,
    "## Concepts to Review",
    conceptsSection,
    "## Practice",
    "- Skim every item above once, start to end, before you dig into any one of them.\n- Then work back through the concepts listed here and check that you can explain each one in your own words before you start the graded work.",
    "## Search Terms",
    searchSection,
  ].join("\n\n");
}

/**
 * Generate a LEARNING RESOURCES page (docs/learning-resources-page-
 * acceptance-criteria.md) for the module a Modules-view selection names.
 * Shaped exactly like generateModuleObjectivesForAssignment
 * (./module-objectives-generator.ts) - moduleLabel + materialsText +
 * provider + courseKind in, `{ text } | { error }` out - so the two
 * generators can sit side by side in generateFromSelectionAction's switch
 * with no special-casing.
 *
 * D1/A8 - THE PROPERTY THIS FUNCTION EXISTS TO GUARANTEE: a model asked for
 * "resources" will confidently emit plausible, dead URLs, fake chapter
 * numbers, fake video titles, and fake authors (see stripModelUrls' own
 * header comment for the real generated course that shipped 37 dead links out
 * of 73). A "resources" page is the single most hallucination-prone artifact
 * this app can produce, so the prompt below FORBIDS all of that outright and
 * defines what a resource is allowed to be instead (materials.selection items
 * named as Canvas names them, concepts to review, practice/self-checks, and
 * plain-text search terms) - and stripModelUrls is still run over the
 * response regardless, as the last line of defense, exactly as it is for
 * module objectives and assignment instructions. A response that strips down
 * to nothing is an error, never an empty success - an empty page silently
 * posted into a module would be a worse failure than a visible one.
 *
 * A7: reuses the shared PLAIN_LANGUAGE_CONTRACT (@/lib/artifact-voice) and
 * courseKindContract/courseKindNoun (@/lib/course-kind) exactly as every
 * other student-facing generator does. Deliberately does NOT reuse
 * BLOOM_OBJECTIVES_CONTRACT (@/lib/bloom-taxonomy) - that contract states a
 * measurable-verb/Bloom-level rule for stating a learning OBJECTIVE, which
 * has no meaning for a resources page (there is no objective being stated
 * here to tag with a verb or a level).
 */
export async function generateLearningResourcesForSelection(
  moduleLabel: string,
  materialsText: string,
  provider: LlmProvider = "gemini",
  courseKind: CourseKind = "coding"
): Promise<{ text: string } | { error: string }> {
  // Embedded Deterministic Engine: template the resources page straight from
  // the selection's own materials, exactly as the objectives generator does
  // for its own scaffold - never a model call, never a silent failure (A9).
  // D1/A8: run through stripModelUrls the same as the LLM path below - the
  // scaffold never INVENTS a URL, but a live item's own body text (copied
  // verbatim into materialsText by gatherSelectionMaterials) can legitimately
  // contain one, and that must not reach a posted page unfiltered either.
  if (provider === "embedded") {
    return { text: stripModelUrls(scaffoldLearningResourcesDoc(moduleLabel, materialsText)).trim() };
  }

  const prompt = `You are an expert educator writing a LEARNING RESOURCES page for a ${courseKindNoun(courseKind)}.

${courseKindContract(courseKind)}

MODULE: ${moduleLabel}

THIS MODULE'S MATERIALS (the assignments, quizzes, pages, and files selected for this module - every resource you write must be drawn from what is actually here):
${materialsText}

Write a Learning Resources page a STUDENT reads directly, in the Canvas page it becomes. Write in the second person, addressing the student as "you". Keep it scannable: short headed sections, one line per resource, no preamble, and no commentary about being an AI, about how this page was produced, or about the instructor's intent.

CRITICAL RULE - NEVER INVENT A LINK, CITATION, OR MEDIA TITLE: you have no way to verify that a URL, a textbook chapter number, a video title, or an author's name is real or still live. Do not write any of those anywhere in this document, under any circumstance, even as an example. A resource, in this document, is ONLY one of these four things:
1. A course item drawn from THIS MODULE'S MATERIALS above, named EXACTLY as it is named there (so the student can find it in the module), with one line on what to focus on or do with it.
2. A concept or skill worth reviewing before attempting that work, with one clause on why it matters for that specific assignment or quiz.
3. A concrete practice suggestion or self-check the student can do on their own, with no outside material required.
4. Search terms (plain words or a short phrase, never a URL) a student could type into a search engine or their library catalog to find outside material themselves.

Inventing a URL, a citation, a chapter number, a video title, or an author's name is a defect, not a feature - never do it, even to seem more helpful.

Structure the document as:
1. A single document title on the very first line, written exactly as the markdown level-1 heading "# Learning Resources: ${moduleLabel}". This must be the only level-1 heading in the document.
2. A "## This Module's Items" section: one line per item drawn from the materials above, named exactly as it is named there, with a short note on what to focus on.
3. A "## Concepts to Review" section: 3-5 concepts or skills, each its own line starting with "- ", each with one clause on why it matters for this module's work.
4. A "## Practice" section: 2-4 concrete practice suggestions or self-checks a student can do on their own.
5. A "## Search Terms" section: 3-6 short search phrases a student could use to find outside material themselves - plain text only, never a URL.
6. Format every section heading as a markdown level-2 heading. Do not use any other markdown symbols (no bold, italics, or numbered lists) in the body text.
7. ${PLAIN_LANGUAGE_CONTRACT}

Do not restate this module's instructions in full - point to what to review and why, never a copy of the instructions themselves.`;

  const result = await callLlm(
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.5, maxOutputTokens: 1536 },
    },
    provider
  );

  if (!result.ok) {
    return { error: `LLM API error for learning resources "${moduleLabel}": HTTP ${result.status} — ${result.body.slice(0, 200)}` };
  }

  if (!result.text.trim()) {
    return { error: `Learning resources generation returned empty response for "${moduleLabel}".` };
  }

  // D1/A8: the last line of defense, applied unconditionally regardless of
  // whether the prompt above was followed - the exact same treatment
  // generateModuleObjectivesForAssignment and
  // generateAssignmentInstructionsForAssignment give their own output.
  const text = stripModelUrls(result.text).trim();

  // A8: a response that is nothing but invented links strips down to "" (or
  // whitespace) - that must surface as an error, never as an empty success
  // silently saved and posted into a module.
  if (!text) {
    return { error: `Learning resources generation for "${moduleLabel}" contained no content once invented links were removed.` };
  }

  return { text };
}
