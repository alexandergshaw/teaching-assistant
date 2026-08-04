// Minimal markdown-to-HTML for generated prose: headings, bullet lists,
// paragraphs, and inline links (a bare URL or a markdown `[text](url)` link)
// only. Escapes all text content (both plain text and a link's own visible
// text/target); no other inline formatting, no raw HTML passthrough. Used for
// LMS page bodies built from generated intro text.

import { tokenizeInline } from "@/lib/docx-blocks";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render one line's worth of already-list-marker-stripped content as inline
 * HTML: a bare URL or a markdown `[text](url)` link becomes a real `<a
 * href="...">...</a>`, everything else is escaped exactly as before (see
 * escapeHtml). Reuses tokenizeInline (../docx-blocks.ts) - the same,
 * already-tested inline-link scanner the .docx renderer uses - so a link is
 * recognized identically in both an exported .docx and an LMS page built from
 * the same generated text, rather than maintaining two independent regexes
 * that could drift apart. Both the link's visible text and its href target
 * are escaped (a target is always `http(s)://...` per tokenizeInline's own
 * regex, but escaping it too costs nothing and guards a stray `"` from
 * breaking out of the attribute).
 */
function renderInlineHtml(content: string): string {
  return tokenizeInline(content)
    .map((token) =>
      token.kind === "link"
        ? `<a href="${escapeHtml(token.url)}">${escapeHtml(token.text)}</a>`
        : escapeHtml(token.text)
    )
    .join("");
}

export function markdownLiteToHtml(text: string): string {
  if (!text.trim()) {
    return "";
  }

  const lines = text.split(/\r?\n/);
  const blocks: string[] = [];
  let currentList: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Empty line: flush any pending list, add nothing
    if (!trimmed) {
      if (currentList.length > 0) {
        blocks.push(`<ul>${currentList.map((item) => `<li>${item}</li>`).join("")}</ul>`);
        currentList = [];
      }
      continue;
    }

    // Bullet list item: "- " or "* "
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const itemText = trimmed.slice(2).trim();
      currentList.push(renderInlineHtml(itemText));
      continue;
    }

    // Flush pending list before non-list block
    if (currentList.length > 0) {
      blocks.push(`<ul>${currentList.map((item) => `<li>${item}</li>`).join("")}</ul>`);
      currentList = [];
    }

    // Heading: one or more # followed by space
    if (trimmed.match(/^#+\s/)) {
      const match = trimmed.match(/^(#+)\s+(.*)$/);
      if (match) {
        const level = match[1].length;
        const title = match[2].trim();
        const headingLevel = level === 1 ? 2 : level === 2 ? 3 : 4;
        blocks.push(`<h${headingLevel}>${renderInlineHtml(title)}</h${headingLevel}>`);
      }
      continue;
    }

    // Regular paragraph
    blocks.push(`<p>${renderInlineHtml(trimmed)}</p>`);
  }

  // Flush any remaining list
  if (currentList.length > 0) {
    blocks.push(`<ul>${currentList.map((item) => `<li>${item}</li>`).join("")}</ul>`);
  }

  return blocks.join("");
}
