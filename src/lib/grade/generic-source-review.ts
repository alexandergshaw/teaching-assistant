import type { GeneralSourceReview } from "./general-execution-evidence";

/** Literal, bounded source excerpts for an instructor. A match is not a
 * finding that the rubric criterion was met or that code was executed. */
export function genericSourceReview(rubric: string, files: readonly { path: string; bytes: Uint8Array }[]): GeneralSourceReview {
  const stop = new Set(["the", "and", "for", "with", "that", "this", "from", "your", "using", "used", "will", "should", "must", "each", "file", "code", "program", "student", "points", "point"]);
  const criteria = rubric.split(/\r?\n/).map(line => line.trim()).filter(line => line.length >= 5 && line.length <= 200).slice(0, 20);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const sources = files.flatMap(file => {
    if (!/\.(?:py|js|ts|tsx|jsx|java|c|h|cpp|cc|cxx|hpp|sql|txt|md)$/i.test(file.path)) return [];
    try { const text = decoder.decode(file.bytes); return text.includes("\0") ? [] : [{ path: file.path, lines: text.split(/\r?\n/) }]; } catch { return []; }
  });
  const items: GeneralSourceReview["rubric"] = [];
  for (const criterion of criteria) {
    const words = [...new Set((criterion.toLowerCase().match(/[a-z][a-z0-9_]{3,}/g) ?? []).filter(word => !stop.has(word)))].slice(0, 12);
    if (!words.length) continue;
    const matches: string[] = [];
    for (const source of sources) {
      for (let i = 0; i < source.lines.length && matches.length < 2; i++) {
        const line = source.lines[i].trim();
        if (line && words.some(word => line.toLowerCase().includes(word))) matches.push(`${source.path}:${i + 1}: ${Array.from(line).slice(0, 180).join("")}`);
      }
      if (matches.length >= 2) break;
    }
    if (matches.length) items.push({ area: Array.from(criterion).slice(0, 256).join(""), comment: `Literal keyword matches, for inspection only:\n${matches.join("\n")}` });
  }
  return { overall: "These are literal source matches to rubric wording, not findings that criteria were met. Check the pinned source and execution observations; test coverage, correctness, and artifact equivalence have not been independently verified.", rubric: items };
}
