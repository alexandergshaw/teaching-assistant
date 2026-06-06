/**
 * Shared AI prompt formatting rules.
 * Import these constants into any action or prompt that generates document content.
 */

export const PROFESSIONAL_SPEECH_RULE =
  "Write in professional, natural human speech. Avoid AI-sounding filler phrases like 'Certainly!', 'Great question!', 'Of course!', 'Absolutely!', or 'It's worth noting that'. Be direct and clear.";

export const DOCUMENT_HEADER_RULES =
  "When using headers, follow this hierarchy only: document title (Title), then H1, then H2, then bold text for sub-points. Do not use H3 or any deeper heading levels. All headers must be in Title Case (capitalise the first letter of each major word) — never all caps and never sentence case. Headings must never contain a colon. Do not write generic procedural headings such as 'Follow these steps', 'Follow the steps below', 'Steps to follow', or any heading that merely tells the reader to follow steps; give the section a descriptive Title Case name instead.";

export const NO_MARKDOWN_SYNTAX_RULE =
  "Do not output raw markdown syntax. Never use '#' characters to indicate headings or '*' (or '**') characters to indicate bold or italic text. Apply the formatting directly — make headings actual headings and bold text actually bold — rather than leaving literal markdown symbols in the output.";

export const DOCUMENT_LABEL_BOLD_RULE =
  "Whenever a sentence or paragraph begins with a label followed by a colon (e.g., 'Social Media Feeds: When you open an app like Instagram...'), that label and its colon must be bolded. This applies to any short descriptive label at the start of a sentence or paragraph before a colon.";

export const DOCUMENT_SECTION_NEWLINE_RULE =
  "Always place a blank line (empty line) before each section heading. There must be exactly one blank line between the end of a section's content and the heading of the next section.";

export const DOCUMENT_HEADING_CENTER_RULE =
  "All headings must be horizontally centered.";

export const HTML_OUTPUT_RULE =
  "Output the document as clean, structured HTML. Use <h1> for the document title only, <h2> for section headings, <p> for body paragraphs, <ul>/<li> for bullet lists, <ol>/<li> for numbered lists, <strong> for bold text, and <em> for italic text. Do not use CSS, class, id, or style attributes. Do not wrap in <html>, <head>, or <body> tags. Return only the HTML — no markdown code fences, no preamble.";

/**
 * Post-processes AI-generated plain text to ensure there is always a blank
 * line before lines that look like section headings (short, non-list lines
 * that are followed by a blank line).
 */
export function normalizeHeadingSpacing(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const prevTrimmed = i > 0 ? lines[i - 1].trim() : "";
    const nextTrimmed = i < lines.length - 1 ? lines[i + 1].trim() : "";
    const isListItem = /^(\d+\.|[-•*])\s/.test(trimmed);
    // A heading candidate: short, non-list, non-blank, followed by a blank line
    if (trimmed && trimmed.length < 80 && !isListItem && !nextTrimmed && prevTrimmed) {
      result.push(""); // insert blank line before the heading
    }
    result.push(lines[i]);
  }
  return result.join("\n");
}
