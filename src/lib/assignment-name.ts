// Mapping helpers between a codebase's assignment-folder slugs (e.g. "review1",
// "assignment3", "exam1", "final") and the human-readable titles/labels used in
// generated documents. Pure functions — no IO — so they're safe on client or
// server and easy to reason about.

// Folder "kinds" we recognize as machine identifiers, used to detect and strip
// slug prefixes without touching legitimate human titles.
const KINDS = "assignment|review|exam|hw|homework|lab|project|week|midterm|final|quiz|module";

const ABBREVIATIONS: Record<string, string> = {
  hw: "Homework",
};

/**
 * Turn a folder slug into a clean, unique label: "review1" -> "Review 1",
 * "assignment3" -> "Assignment 3", "assignment-03" -> "Assignment 3",
 * "exam1" -> "Exam 1", "hw2" -> "Homework 2", "final" -> "Final".
 */
export function humanizeAssignmentName(slug: string): string {
  const raw = slug.trim();
  if (!raw) return "Assignment";

  // A leading word followed (optionally) by a trailing number, with any mix of
  // separators between — the common "review1" / "assignment-03" shape.
  const match = raw.match(/^([a-zA-Z]+)[\s_-]*(\d+)?$/);
  if (match) {
    const key = match[1].toLowerCase();
    const word = ABBREVIATIONS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
    return match[2] ? `${word} ${parseInt(match[2], 10)}` : word;
  }

  // Fallback: title-case whatever separator-delimited words are present.
  return raw
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Strip a leading machine-slug prefix from a title line so a source heading like
 * "review1: Review: Fundamentals" becomes "Review: Fundamentals".
 *
 * Only the bare concatenated slug form (no internal space, e.g. "review1:") is
 * removed — a legitimate human title such as "Assignment 0: Setup, Git, and
 * Vercel" (note the space before the number) is left untouched.
 */
export function stripAssignmentSlugPrefix(title: string, slug?: string): string {
  const text = title.trim();

  const patterns: RegExp[] = [];
  if (slug && slug.trim()) {
    const escaped = slug.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    patterns.push(new RegExp(`^${escaped}\\s*[:.)\\-]\\s*`, "i"));
  }
  // Generic bare-slug prefix: a recognized kind glued to a number ("review2"),
  // followed by a separator. The lack of a space before the digit is what marks
  // it as a machine identifier rather than a human title.
  patterns.push(new RegExp(`^(?:${KINDS})\\d+\\s*[:.)\\-]\\s*`, "i"));

  for (const re of patterns) {
    const next = text.replace(re, "");
    if (next !== text) return next.trim();
  }
  return text;
}

/**
 * True when a whole line is just a machine identifier ("review2", "assignment3",
 * "final", "week 3"). The renderers use this to refuse to promote such a line to
 * a heading. Multi-word section headings ("Assignment Overview", "Instructions")
 * are not matched.
 */
export function looksLikeAssignmentSlug(line: string): boolean {
  const text = line.trim().replace(/[:.)\-]+$/, "").trim();
  return new RegExp(`^(?:${KINDS})[\\s_-]*\\d*$`, "i").test(text);
}
