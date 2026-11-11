import type { RubricCriterion } from "./types";
import { normalizeAreaName } from "./prompts";
import type { RubricAreaResult } from "./types";

/** Reject unlisted ratings, incomplete criteria and altered scales; never round. */
export function validateBrightspaceRatings(areas: readonly RubricAreaResult[], criteria: readonly RubricCriterion[]): boolean {
  if (areas.length !== criteria.length) return false;
  const seen = new Set<string>();
  for (const area of areas) {
    const key = normalizeAreaName(area.area), criterion = criteria.find((item) => normalizeAreaName(item.name) === key);
    const match = area.score.trim().match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
    if (!criterion || seen.has(key) || criterion.points === null || !match) return false;
    const earned = Number(match[1]), possible = Number(match[2]);
    if (possible !== criterion.points || ![0, 0.7 * possible, possible].some((allowed) => Math.abs(earned - allowed) < 1e-9)) return false;
    seen.add(key);
  }
  return true;
}

/** Parse the flattened three-rating Brightspace rubric only when the complete table is recognizable. */
export function parseBrightspaceRubric(text: string): { kind: "other" } | { kind: "invalid" } | { kind: "parsed"; criteria: RubricCriterion[] } {
  const scaleLines = text.split(/\r?\n/).filter((line) => /^\s*(?:rating\s+scale|ratings)\s*:/i.test(line));
  if (scaleLines.some((line) => /(?:meets|partially meets|does not meet)\s+expectations/i.test(line))) {
    if (scaleLines.length !== 1 || !/^\s*(?:rating\s+scale|ratings)\s*:\s*meets expectations\s+100%\s*;\s*partially meets expectations\s+70%\s*;\s*does not meet expectations\s+0%\s*\.?\s*$/i.test(scaleLines[0])) return { kind: "invalid" };
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.at(-1) !== scaleLines[0].trim()) return { kind: "invalid" };
    const criteria: RubricCriterion[] = [], seen = new Set<string>(); let unit: "percent" | "points" | undefined;
    for (const line of lines.slice(0, -1)) {
      const match = /^(.+?)\s*\(\s*(\d+(?:\.\d+)?)\s*(pts?|points?|%)\s*\)\s*:\s*(\S.*)$/i.exec(line);
      if (!match) return { kind: "invalid" };
      const name = match[1].trim(), key = normalizeAreaName(name), points = Number(match[2]);
      if (!key || name.length > 200 || seen.has(key) || !Number.isFinite(points) || points <= 0) return { kind: "invalid" };
      const nextUnit = match[3] === "%" ? "percent" : "points";
      if (unit && unit !== nextUnit) return { kind: "invalid" };
      unit = nextUnit; seen.add(key); criteria.push({ name, points });
    }
    const total = criteria.reduce((sum, item) => sum + (item.points ?? 0), 0);
    if (!criteria.length || !Number.isFinite(total) || total <= 0 || (unit === "percent" && Math.abs(total - 100) > 0.0001)) return { kind: "invalid" };
    return { kind: "parsed", criteria };
  }
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
  if (!criteria.length || !/^total\s*:?$/i.test(lines[cursor] ?? "") || !/^100\s*%$/.test(total ?? "") || cursor + 2 !== lines.length || Math.abs(criteria.reduce((sum, item) => sum + (item.points ?? 0), 0) - 100) > 0.0001) return { kind: "invalid" };
  return { kind: "parsed", criteria };
}
