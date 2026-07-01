/**
 * Deterministic markdown-document scaffolds for the "generate a document" flows.
 * Output uses the lightweight markdown the docx builder expects (a single "# "
 * title, "## " section headings, "- " bullets, blank-line-separated paragraphs).
 * Everything is templated from the instructor's own input, with no model call and
 * no invented facts; placeholders mark where specifics should be filled in.
 */

import {
  capitalizeFirst,
  deriveTitle,
  ensureSentence,
  extractDefinitions,
  summarize,
  summarizeObjectives,
  toBullets,
} from "./scaffold";

/** A general handout/document scaffold built from a freeform prompt. */
export function scaffoldDocument(prompt: string): string {
  const title = deriveTitle(prompt, "", "Course Document");
  const bullets = toBullets(prompt);
  const overview =
    capitalizeFirst(ensureSentence(summarize(prompt, 2))) ||
    capitalizeFirst(ensureSentence(prompt));
  const detailBullets = (
    bullets.length > 1 ? bullets : ["[Add the first key point here]", "[Add another key point here]"]
  )
    .map((b) => `- ${b}`)
    .join("\n");

  // A Key Terms section only when the prompt actually defines terms.
  const definitions = extractDefinitions(prompt, 6);
  const keyTermsSection =
    definitions.length > 0
      ? ["## Key Terms", definitions.map((d) => `- ${d.definition}`).join("\n")]
      : [];

  return [
    `# ${title}`,
    "## Overview",
    overview,
    "## Details",
    detailBullets,
    ...keyTermsSection,
    "## Summary",
    "Review the points above and add any specifics relevant to your course.",
  ].join("\n\n");
}

/**
 * A module-introduction document (markdown) built from an assignment's title and
 * source content. Mirrors the section structure of the LLM version.
 */
export function scaffoldModuleIntroDoc(displayTitle: string, content: string): string {
  const summary = summarizeObjectives(content);
  const contentSummary = content.trim() ? capitalizeFirst(ensureSentence(summarize(content, 1))) : "";
  const overview = [
    ensureSentence(`This module introduces ${displayTitle.toLowerCase()} and why it matters`),
    summary,
    contentSummary,
  ]
    .filter(Boolean)
    .join(" ");

  return [
    `# Module Introduction: ${displayTitle}`,
    overview,
    "## Real-World Applications",
    "These concepts appear across real software and everyday technology. Add two or three concrete examples your students will recognize.",
    "## What You Will Learn",
    toBullets(content).slice(0, 5).map((b) => `- ${b}`).join("\n") || "- [List the key skills and concepts here]",
  ].join("\n\n");
}

/**
 * A student-facing assignment instruction sheet (markdown) built from an
 * assignment's title and README/source content.
 */
export function scaffoldAssignmentDoc(displayTitle: string, content: string): string {
  const instructionBullets =
    toBullets(content).slice(0, 8).map((b) => `- ${b}`).join("\n") ||
    "- [List each task the student must complete]";

  return [
    `# ${displayTitle}`,
    "## Assignment Overview",
    ensureSentence(`This assignment covers ${displayTitle.toLowerCase()} and the objectives described in the source material`),
    "## Instructions",
    instructionBullets,
    "## Requirements",
    "- Meet each instruction listed above",
    "- Use only free, accessible tools",
    "## Deliverables",
    "- Submit the up-to-date zip of the entire codebase with all completed files included",
  ].join("\n\n");
}
