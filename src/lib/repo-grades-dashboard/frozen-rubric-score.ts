import { extractRubricCriteriaForEvidence } from "@/lib/grade/rubric";
import { parseEarnedPossibleScore } from "@/lib/grade/parsing";
import { parseBrightspaceRubric } from "@/lib/grade/brightspace-rubric";

/** Fail closed when the frozen rubric or model output cannot be reconciled. */
export function matchesFrozenRubricScore(
  rubric: string, areas: readonly { area: string; score: string }[], total: { earned: number; possible: number },
): boolean {
  // The shared rubric parser splits CR/LF only; other line separators could
  // otherwise conceal a criterion within an accepted heading.
  if (/[\u000b\u000c\u0085\u2028\u2029]/.test(rubric) || /\r(?!\n)/.test(rubric)) return false;
  // The evidence parser rejects duplicate criterion names. Normalize only
  // criterion-heading percentages to points so it can validate either scale.
  const normalized = rubric.replace(/^(\S[^\r\n]*?\(\s*\d+(?:\.\d+)?\s*)%(\s*\)\s*:)/gm, "$1 points$2");
  const table = parseBrightspaceRubric(normalized);
  if (table.kind === "invalid") return false;
  const tableLines = rubric.split(/[\r\n\t]+/).map(line => line.trim()).filter(Boolean);
  const tableStart = tableLines.findIndex(line => /^criteria$/i.test(line));
  if (table.kind === "parsed" && tableStart > 0) return false;
  // Non-table rubrics must have a fully recognized top-level schema. A
  // permissive parser can otherwise miss a second, differently formatted
  // criterion while still returning the first one. Any separate detail line
  // is ambiguous with another criterion and therefore requires review.
  if (table.kind === "other" && rubric.split(/\r?\n/).some(line => line.trim()
    && (/^\s/.test(line) || !/^.+?\s*\(\s*\d+(?:\.\d+)?\s*(?:pts?|points?|%)\s*\)\s*:/i.test(line)
      || [...line.matchAll(/\(\s*\d+(?:\.\d+)?\s*(?:pts?|points?|%)\s*\)/gi)].length !== 1
      || /:\s*\d+(?:\.\d+)?\s*(?:pts?|points?|%)(?:\b|(?=\s|$))/i.test(line)))) return false;
  const parsed = extractRubricCriteriaForEvidence(normalized);
  if (!parsed.ok) return false;
  const criteria = parsed.criteria;
  if (!criteria.length || criteria.length !== areas.length || total.possible <= 0) return false;
  const key = (value: string) => value.trim().toLocaleLowerCase("en-US");
  const expectedNames = criteria.map(item => key(item.name));
  if (new Set(expectedNames).size !== criteria.length || new Set(areas.map(item => key(item.area))).size !== areas.length) return false;
  const percentages = criteria.map(item => {
    const matches = rubric.split(/\r?\n/).map(line => line.trim().match(/^(.+?)\s*\(\s*(\d+(?:\.\d+)?)\s*%\s*\)\s*:/))
      .filter(match => match && key(match[1]) === key(item.name));
    return matches.length === 1 ? Number(matches[0]![2]) : null;
  });
  const percentageRubric = criteria.every((_item, index) => percentages[index] !== null);
  const pointRubric = percentages.every(value => value === null) && criteria.every(item => item.points !== null && Number.isFinite(item.points) && item.points! > 0);
  if (!percentageRubric && !pointRubric) return false;
  const weights = percentageRubric ? percentages as number[] : criteria.map(item => item.points!);
  const maximum = weights.reduce((sum, value) => sum + value, 0);
  if (maximum <= 0 || (percentageRubric && Math.abs(maximum - 100) > 1e-7)) return false;
  let earned = 0;
  for (let i = 0; i < criteria.length; i++) {
    const matches = areas.filter(item => key(item.area) === expectedNames[i]);
    if (matches.length !== 1) return false;
    if (!/^\s*\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?\s*$/.test(matches[0].score)) return false;
    const score = parseEarnedPossibleScore(matches[0].score);
    if (!score || score.possible <= 0 || score.earned < 0 || score.earned > score.possible) return false;
    if (pointRubric && Math.abs(score.possible - weights[i]) > 1e-7) return false;
    earned += (score.earned / score.possible) * weights[i];
  }
  return Math.abs(earned / maximum - total.earned / total.possible) < 1e-6;
}
