/**
 * Z2 (Group Z): the CODING class opener's warm-up stops asking students to
 * WRITE code. The opener runs BEFORE the lecture that teaches the concept,
 * so asking a student to produce code they have not been taught yet is both
 * discouraging and pedagogically backwards - the point is familiarity with
 * the idea, so the lecture lands on prepared ground. READING code is fine
 * and often ideal; WRITING, completing, or debugging-by-editing it is out.
 *
 * Two layers, mirroring enforceNoCodeForApplied's own precedent
 * (src/lib/slide-prompt.ts): a prompt-level menu of six read-only warm-up
 * forms (CODING_WARMUP_FORMS/describeCodingWarmupMenu, composed into
 * generateClassOpenerAction's LLM prompt, src/app/actions/research.ts), AND
 * a DATA-LAYER guard (enforceReadOnlyWarmup) that scans the generated
 * warm-up section for write/implement/complete/debug-by-editing language and
 * replaces that section with a guaranteed-safe fallback when it finds any -
 * a comment telling the prompt not to ask for code has already been shown,
 * twice, not to be enough on its own (see enforceNoCodeForApplied's own doc
 * comment and docs/REGRESSION.md entry 137).
 *
 * Pure: no I/O, no Date, no randomness.
 */

export interface WarmupForm {
  /** The form's name, exactly as stated in the prompt menu. */
  name: string;
  /** What the form asks the student to do - never a program. */
  description: string;
}

/**
 * The six-form menu (Z2-AC2). The model picks whichever form best fits the
 * week's concept; the deliverable is always prose, a table, a diagram, or an
 * ordering - never a program.
 */
export const CODING_WARMUP_FORMS: WarmupForm[] = [
  {
    name: "Trace and predict",
    description: "show a short, correct snippet and ask what it produces, or what a variable holds at a given point.",
  },
  {
    name: "Order the steps",
    description: "give the stages of an algorithm or process out of order and ask for the correct sequence, with a reason.",
  },
  {
    name: "Spot the flaw by reading",
    description: "show code with one clear problem and ask what goes wrong and when, without asking for a fix in code.",
  },
  {
    name: "Compare two approaches",
    description: "two snippets that both work; which is better here and why (speed, memory, readability, failure modes).",
  },
  {
    name: "Complete a trace table",
    description: "fill in variable or data-structure state after each step.",
  },
  {
    name: "Map the analogy",
    description: "connect the concept to something the student already knows, then say where the analogy breaks down.",
  },
];

/** Render CODING_WARMUP_FORMS as a bulleted prompt menu. */
export function describeCodingWarmupMenu(): string {
  return CODING_WARMUP_FORMS.map((form) => `  - ${form.name}: ${form.description}`).join("\n");
}

// Phrases that instruct the STUDENT to produce, complete, or debug-by-editing
// code themselves - the exact line Z2-AC1 draws. READING code (a snippet
// shown FOR the student to read) never matches these; only an imperative
// asking the student to author or alter code does.
const WRITE_CODE_PATTERNS: RegExp[] = [
  /\bwrite\s+(?:a|an|the|your|some)?\s*(?:program|script|function|method|class|code)\b/i,
  /\bimplement\s+(?:a|an|the|your)?\s*(?:program|script|function|method|class|algorithm|solution)\b/i,
  /\bcode\s+up\b/i,
  /\bcode\s+(?:a|an|the|your)?\s*(?:program|script|function|solution)\b/i,
  /\bcomplete\s+the\s+(?:function|code|program|method)\b/i,
  /\bfill\s+in\s+the\s+(?:blank|code|function)\b/i,
  /\bfix\s+the\s+(?:bug|code|error)\s+(?:in|below)\b/i,
  /\bdebug\s+(?:and\s+)?fix\b/i,
  /\byour\s+own\s+(?:code|implementation|program|function)\b/i,
];

/** The first write-code violation found in `text`, or null when clean. */
export function findWriteCodeViolation(text: string): string | null {
  for (const pattern of WRITE_CODE_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

/**
 * A guaranteed-safe, code-free fallback warm-up (the "Map the analogy" form -
 * the one form of the six that can never accidentally ask for code, since it
 * has no code in it at all), used when the model's own warm-up violates the
 * no-write-code rule. Deterministic given the topic; never fabricates a
 * technical fact.
 */
export function buildFallbackWarmup(topic: string): string {
  const subject = topic.trim() || "this week's concept";
  return `Map the analogy: think of ${subject} in terms of something you already know well - a system, process, or everyday task with a similar shape. Describe the analogy in your own words: what does each part of ${subject} correspond to in your example? Then identify one place where the analogy breaks down - where ${subject} behaves differently from your everyday comparison.`;
}

/**
 * Enforce the read-only warm-up at the DATA layer for a CODING course opener
 * (Z2-AC3). Locates the warm-up section (from its "## <heading>" line up to
 * the next "## " heading, or the end of the document) and, ONLY if that
 * section contains write/implement/complete/debug-by-editing language,
 * replaces its body with buildFallbackWarmup's guaranteed-safe text - a
 * targeted repair, never a whole-document failure, mirroring
 * enforceNoCodeForApplied's own "strip the two fields, keep the rest of the
 * deck" philosophy. Never mutates in place (returns a new string); never
 * misfires when the heading cannot be located (returns the input unchanged,
 * violations 0) rather than guessing at section boundaries.
 */
export function enforceReadOnlyWarmup(
  openerText: string,
  warmupHeading: string,
  topic: string
): { text: string; violations: number } {
  const escapedHeading = warmupHeading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingRe = new RegExp(`^## ${escapedHeading}.*$`, "m");
  const headingMatch = openerText.match(headingRe);
  if (!headingMatch || headingMatch.index === undefined) {
    return { text: openerText, violations: 0 };
  }

  const sectionStart = headingMatch.index + headingMatch[0].length;
  const rest = openerText.slice(sectionStart);
  const nextHeadingMatch = rest.match(/\n## /);
  const sectionEnd =
    nextHeadingMatch && nextHeadingMatch.index !== undefined ? sectionStart + nextHeadingMatch.index : openerText.length;
  const body = openerText.slice(sectionStart, sectionEnd);

  if (!findWriteCodeViolation(body)) {
    return { text: openerText, violations: 0 };
  }

  const safeBody = `\n\n${buildFallbackWarmup(topic)}\n`;
  return {
    text: openerText.slice(0, sectionStart) + safeBody + openerText.slice(sectionEnd),
    violations: 1,
  };
}
