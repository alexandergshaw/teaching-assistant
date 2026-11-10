import type { RubricCriterion } from "./types";
import { normalizeAreaName } from "./prompts";

/** Parse the flattened three-rating Brightspace rubric only when the complete table is recognizable. */
export function parseBrightspaceRubric(text: string): { kind: "other" } | { kind: "invalid" } | { kind: "parsed"; criteria: RubricCriterion[] } {
  const lines = text.split(/[\r\n\t]+/).map((line) => line.trim()).filter(Boolean);
  const rating = /^(?:meets|partially meets|does not meet) expectations\s*\(\d+%\)$/i;
  const ratings = lines.filter((line) => rating.test(line)).length;
  const start = lines.findIndex((line) => /^criteria$/i.test(line));
  const recognizable = ratings >= 2 || (ratings >= 1 && start >= 0 && lines.some((line) => /^value$/i.test(line)));
  if (!recognizable) return { kind: "other" };
  if (start < 0 || ratings !== 3 || lines.filter((line) => /^criteria$/i.test(line)).length !== 1) return { kind: "invalid" };
  if (!/^meets expectations\s*\(100%\)$/i.test(lines[start + 1] ?? "") || !/^partially meets expectations\s*\(70%\)$/i.test(lines[start + 2] ?? "") || !/^does not meet expectations\s*\(0%\)$/i.test(lines[start + 3] ?? "") || !/^value$/i.test(lines[start + 4] ?? "")) return { kind: "invalid" };
  const criteria: RubricCriterion[] = []; const names = new Set<string>(); let cursor = start + 5;
  while (cursor < lines.length && !/^total\s*:?$/i.test(lines[cursor])) {
    const [name, a, b, c, value] = lines.slice(cursor, cursor + 5);
    const points = Number(value); const key = name ? normalizeAreaName(name) : "";
    if (!name || name.length > 200 || !key || !a || !b || !c || !/^\d+(?:\.\d+)?$/.test(value ?? "") || !Number.isFinite(points) || points <= 0 || names.has(key)) return { kind: "invalid" };
    names.add(key); criteria.push({ name, points }); cursor += 5;
  }
  const total = lines[cursor + 1];
  if (!criteria.length || !/^total\s*:?$/i.test(lines[cursor] ?? "") || !/^100\s*%$/.test(total ?? "") || Math.abs(criteria.reduce((sum, item) => sum + (item.points ?? 0), 0) - 100) > 0.0001) return { kind: "invalid" };
  return { kind: "parsed", criteria };
}
