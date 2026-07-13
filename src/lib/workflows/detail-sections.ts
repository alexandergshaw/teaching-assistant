// Pure presentation helper for the grade-review row detail panel
// (WorkflowsTab's table review pause). The registry's grade-submissions
// rowDetail (src/lib/workflows/registry.ts) builds its `text` blob out of
// blocks separated by blank lines, some of which start with a short label
// like "Rubric breakdown:" or "AI feedback:" - occasionally with the first
// line's content continuing right after the colon (e.g.
// "Code run during grading: ran cleanly (exit 0)").
//
// This does NOT hard-code that list of labels: it uses a generic heuristic
// (a colon within a short leading span of the block's first line) so it
// keeps working if the registry adds or renames sections. Text with no
// recognizable header renders as a single bodyless-header block, which the
// caller can fall back to rendering exactly as before (pre-wrap, no header).

export interface DetailSection {
  header: string | null;
  body: string;
}

// Header candidates are short labels ("Rubric breakdown:", "Code run during
// grading:") - a colon this far into the first line is almost certainly a
// section label, not prose (which would run well past this length before
// its first colon, if it has one at all).
const MAX_HEADER_LENGTH = 48;

export function splitDetailSections(text: string): DetailSection[] {
  const blocks = text.split(/\n\s*\n/).filter((b) => b.trim() !== "");
  if (blocks.length === 0) return [];

  return blocks.map((block) => {
    const newlineIndex = block.indexOf("\n");
    const firstLine = newlineIndex === -1 ? block : block.slice(0, newlineIndex);
    const restLines = newlineIndex === -1 ? "" : block.slice(newlineIndex + 1);

    const colonIndex = firstLine.indexOf(":");
    const headerCandidate = colonIndex === -1 ? "" : firstLine.slice(0, colonIndex).trim();

    if (
      colonIndex === -1 ||
      headerCandidate === "" ||
      colonIndex > MAX_HEADER_LENGTH
    ) {
      return { header: null, body: block };
    }

    const header = firstLine.slice(0, colonIndex + 1);
    const trailingOnHeaderLine = firstLine.slice(colonIndex + 1).trim();
    const body = [trailingOnHeaderLine, restLines].filter((s) => s !== "").join("\n");

    return { header, body };
  });
}
