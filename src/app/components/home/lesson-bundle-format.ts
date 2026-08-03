// Pure formatting/parsing helpers for the Pre Built lesson flow, lifted
// verbatim out of page.tsx's buildLessonZip() and saveLessonFieldEdit().
//
// They live here rather than staying inline for the reason CoursesTab's
// weekly-checklist-overview-window.ts exists: vitest in this repo runs in the
// "node" environment over *.test.ts only (see vitest.config.ts), so nothing
// rendered by React is reachable from a test. Logic buried inside a component
// is therefore logic that can never be covered. Moving these four functions
// out is what makes them testable at all - the behaviour is unchanged.

import type { ExamplesData } from "../../actions-types";
import { getCommentPrefix } from "../../home-helpers";
import { parseGeneratedRubric } from "../../utils/rubric";

/**
 * Renders the rubric preview as the plain-text rubric.txt that goes into the
 * lesson zip. Falls back to the raw preview text under the same heading when
 * parseGeneratedRubric cannot find any rows - a rubric the parser does not
 * recognise is still worth shipping verbatim rather than dropping.
 * Returns "" for no rubric, which is the caller's signal to omit the file.
 */
export function formatRubricText(rubricPreview: string | null): string {
  if (!rubricPreview) return "";
  const rows = parseGeneratedRubric(rubricPreview);
  if (!rows) return `GRADING RUBRIC\n==============\n\n${rubricPreview}`;

  const lines: string[] = ["GRADING RUBRIC", "==============", ""];
  for (const row of rows) {
    const weight = row.weight.endsWith("%") ? row.weight : `${row.weight}%`;
    lines.push(`${row.area} (${weight}): ${row.description}`);
    for (const sub of row.subcategories) {
      lines.push(`  ${sub.label}: ${sub.description}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Renders the generated examples as the examples.txt in the lesson zip. Every
 * non-code line is prefixed with the comment marker for that example's own
 * language (getCommentPrefix), so the file stays syntactically valid when the
 * instructor opens it as source - the example bodies themselves are emitted
 * raw. An empty line stays empty rather than becoming a bare marker.
 * Returns "" when there is nothing to write, so the caller omits the file.
 */
export function formatExamplesText(examplesPreview: ExamplesData | null): string {
  if (!examplesPreview || examplesPreview.examples.length === 0) return "";

  const lines: string[] = [];
  examplesPreview.examples.forEach((example, index) => {
    const prefix = getCommentPrefix(example.language);
    const commentLine = (text: string) => (text === "" ? "" : `${prefix} ${text}`);
    if (index === 0) {
      lines.push(commentLine("IN-CLASS EXAMPLES"));
      lines.push(commentLine("================="));
      lines.push("");
    }
    const heading = `EXAMPLE ${index + 1}: ${example.title}`;
    lines.push(commentLine(heading));
    lines.push(commentLine("-".repeat(heading.length)));
    lines.push("");
    lines.push(example.content);
    lines.push("");
    lines.push(commentLine("EXPLANATION:"));
    example.explanation.split("\n").forEach((line) => lines.push(commentLine(line)));
    lines.push("");
  });
  return lines.join("\n");
}

/**
 * Turns a presentation title into the lesson zip's base filename: everything
 * outside [a-z0-9] collapses to a single underscore, so an arbitrary title is
 * always safe on every filesystem the download can land on.
 */
export function bundleFileBaseName(presentationTitle: string): string {
  return presentationTitle.replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_");
}

/**
 * Every field the lesson preview can save an inline edit to. The indexed
 * variants name a position in the slides/steps/examples array.
 */
export type LessonFieldTarget =
  | { kind: "lesson-title" }
  | { kind: "intro-overview" }
  | { kind: "intro-keyTerms" }
  | { kind: "slide"; index: number }
  | { kind: "assignment-overview" }
  | { kind: "assignment-step"; index: number }
  | { kind: "assignment-tools" }
  | { kind: "assignment-deliverables" }
  | { kind: "rubric" }
  | { kind: "example-content"; index: number }
  | { kind: "example-explanation"; index: number };

// Prefix-keyed targets. Declaring them as data rather than as a chain of
// `key.slice(<hand-counted number>)` calls is the point: the old inline
// version hand-counted every offset ("assignment-step-" and "example-content-"
// are both 16, "example-explanation-" is 20), and a miscount there silently
// edits the wrong array element instead of failing. Here the offset is always
// the prefix's own length. No prefix is a prefix of another, so order is not
// load-bearing, and EXACT_KEYS is consulted first regardless.
const INDEXED_PREFIXES: ReadonlyArray<{
  prefix: string;
  build: (index: number) => LessonFieldTarget;
}> = [
  { prefix: "example-explanation-", build: (index) => ({ kind: "example-explanation", index }) },
  { prefix: "example-content-", build: (index) => ({ kind: "example-content", index }) },
  { prefix: "assignment-step-", build: (index) => ({ kind: "assignment-step", index }) },
  { prefix: "slide-", build: (index) => ({ kind: "slide", index }) },
];

const EXACT_KEYS: Record<string, LessonFieldTarget> = {
  "lesson-title": { kind: "lesson-title" },
  "intro-overview": { kind: "intro-overview" },
  "intro-keyTerms": { kind: "intro-keyTerms" },
  "assignment-overview": { kind: "assignment-overview" },
  "assignment-tools": { kind: "assignment-tools" },
  "assignment-deliverables": { kind: "assignment-deliverables" },
  rubric: { kind: "rubric" },
};

/**
 * Resolves the copy/edit key the lesson preview hands back into the field it
 * names. Returns null for anything unrecognised, and - unlike the inline
 * chain this replaces - also for a prefixed key whose suffix is not a
 * non-negative integer: "slide-x" used to reach `slides[NaN] = ...`, which
 * silently grew a junk property on the array instead of editing a slide. No
 * caller can currently produce such a key (they are all built from real
 * indices), so this only closes the hole rather than changing any live path.
 */
export function parseLessonFieldKey(key: string): LessonFieldTarget | null {
  const exact = EXACT_KEYS[key];
  if (exact) return exact;

  for (const { prefix, build } of INDEXED_PREFIXES) {
    if (!key.startsWith(prefix)) continue;
    const suffix = key.slice(prefix.length);
    // Number() rather than parseInt: parseInt("3abc") is 3, which would let a
    // malformed key through as a valid index.
    if (!/^\d+$/.test(suffix)) return null;
    return build(Number(suffix));
  }
  return null;
}
