// Minimal markdown-to-HTML for generated prose: headings, bullet lists, and
// paragraphs only. Escapes all text content; no inline formatting, no raw HTML
// passthrough. Used for LMS page bodies built from generated intro text.

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
      currentList.push(escapeHtml(itemText));
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
        blocks.push(`<h${headingLevel}>${escapeHtml(title)}</h${headingLevel}>`);
      }
      continue;
    }

    // Regular paragraph
    blocks.push(`<p>${escapeHtml(trimmed)}</p>`);
  }

  // Flush any remaining list
  if (currentList.length > 0) {
    blocks.push(`<ul>${currentList.map((item) => `<li>${item}</li>`).join("")}</ul>`);
  }

  return blocks.join("");
}
