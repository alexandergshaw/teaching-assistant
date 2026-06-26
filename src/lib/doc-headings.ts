import type { OfficeParagraph } from "./office-edit";

// Shared, dependency-free helpers for guessing a docx's title and headings, used
// both by the structure editor (client) and the headless auto-fix (server). Keep
// this module free of runtime imports from office-edit so it stays client-safe.

/** A clean default title from a file name: drop the extension and Canvas's
 *  " (N)" dedup suffix so "Syllabus (3).docx" suggests "Syllabus". */
export function titleFromFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return stem.replace(/\s*\(\d+\)\s*$/, "").trim();
}

/**
 * Heuristic: guess which paragraphs are headings (short, all-bold or larger than
 * the body text, not ending like a sentence). The first becomes Heading 1, the
 * rest Heading 2 — a starting point a human reviews, or the auto-fix applies.
 */
export function suggestHeadingLevels(paragraphs: OfficeParagraph[]): Record<string, string> {
  const sizeCounts = new Map<number, number>();
  for (const p of paragraphs) {
    const sz = p.runs[0]?.sizePt;
    if (sz) sizeCounts.set(sz, (sizeCounts.get(sz) ?? 0) + 1);
  }
  let bodySize = 0;
  let best = 0;
  for (const [sz, c] of sizeCounts) if (c > best) [best, bodySize] = [c, sz];

  const out: Record<string, string> = {};
  let assignedFirst = false;
  for (const p of paragraphs) {
    const text = p.text.trim();
    if (!text || text.length > 90) continue;
    const allBold = p.runs.length > 0 && p.runs.every((r) => r.bold);
    const sz = p.runs[0]?.sizePt;
    const bigger = sz != null && bodySize > 0 && sz > bodySize;
    if ((allBold || bigger) && !/[.!?,:;]$/.test(text)) {
      out[p.id] = assignedFirst ? "Heading2" : "Heading1";
      assignedFirst = true;
    }
  }
  return out;
}
