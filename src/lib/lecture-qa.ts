// Pure helpers for the "lecture-qa" step's worked example programs.
//
// generateLectureQaAction (src/app/actions/course-planning.ts) asks the model
// for 2-3 example programs alongside the anticipated questions, in the same
// JSON call. That file is "use server" and may only export async functions,
// so the defensive parsing and the markdown rendering used by both the docx
// builder and the qaText longtext output live here instead, where they can be
// unit-tested directly.
//
// Pure: no I/O, no Date, no randomness.

/** One worked example program: a complete, runnable program plus context. */
export interface QaExample {
  title: string;
  language: string;
  code: string;
  explanation: string;
}

const MAX_EXAMPLES = 3;

/**
 * Defensively parse the model's "examples" field into a clamped, validated
 * list. Never throws: a missing field, a non-array value, non-object
 * entries, or entries with an empty title/code all degrade to dropping just
 * that entry (or the whole field) rather than failing the run - the
 * questions are the primary deliverable. Clamps to at most 3 usable
 * examples, matching what the prompt asks for.
 */
export function parseQaExamples(raw: unknown): QaExample[] {
  if (!Array.isArray(raw)) return [];

  const examples: QaExample[] = [];
  for (const entry of raw) {
    if (examples.length >= MAX_EXAMPLES) break;
    if (!entry || typeof entry !== "object") continue;

    const e = entry as Record<string, unknown>;
    const title = typeof e.title === "string" ? e.title.trim() : "";
    const code = typeof e.code === "string" ? e.code.replace(/\s+$/, "") : "";
    // Drop any entry with an empty code or title - not a usable example.
    if (!title || !code) continue;

    const language = typeof e.language === "string" && e.language.trim() ? e.language.trim() : "text";
    const explanation = typeof e.explanation === "string" ? e.explanation.trim() : "";

    examples.push({ title, language, code, explanation });
  }
  return examples;
}

/**
 * Render the example-programs section as markdown lines for
 * buildDocxFromPlainText: "## Example programs" (Heading 1), then per
 * example "### <title>" (Heading 2), the explanation as a body paragraph,
 * and the code inside a ``` fence opened with the language so the shared
 * docx renderer's CodeFenceTracker picks it up (see docx-blocks.ts).
 *
 * Returns [] when there are no examples - "where applicable" means the
 * section is omitted entirely from the document, never an empty heading or
 * placeholder text.
 */
export function buildExampleProgramsDocLines(examples: QaExample[]): string[] {
  if (examples.length === 0) return [];

  const lines: string[] = ["", "## Example programs"];
  for (const ex of examples) {
    lines.push("", `### ${ex.title}`, "");
    if (ex.explanation) lines.push(ex.explanation, "");
    lines.push("```" + ex.language, ex.code, "```");
  }
  return lines;
}

/**
 * Render the example-programs block appended to the qaText longtext output,
 * clearly delimited from the existing Q<n>/A pairs so a downstream step
 * binding qaText can tell the two sections apart without parsing markdown.
 * Returns "" when there are no examples, so qaText stays byte-identical to
 * the questions-only format in that case.
 */
export function buildExampleProgramsTextBlock(examples: QaExample[]): string {
  if (examples.length === 0) return "";

  const rendered = examples
    .map((ex, i) => {
      const parts = [`Example ${i + 1}: ${ex.title} (${ex.language})`, "", ex.code];
      if (ex.explanation) parts.push("", `Explanation: ${ex.explanation}`);
      return parts.join("\n");
    })
    .join("\n\n\n");

  return `\n\n\n=== Example programs ===\n\n${rendered}`;
}
