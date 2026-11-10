import type { RubricAreaResult, RubricCriterion } from "./types";
import { isReplySectionMarker } from "./rubric-reply-marker";

/** Detect rubric length rules that need a proven exemption before grading. */
export function hasRubricLengthRule(rubric: string): boolean {
  return /\b(?:length|word\s*count|character\s*count|page\s*count|(?:word|page|character)\s+(?:limit|minimum|requirement)|\d+(?:\s*[-–]\s*\d+)?\s*[-–]?\s*(?:words?|characters?|pages?)|(?:fewer|less|under|below|at\s+least|minimum(?:\s+of)?)\s+(?:than\s+)?\d+\s*(?:words?|characters?|pages?))\b/i.test(rubric);
}

/** Remove only an unambiguous numeric modifier from a create/submit instruction. */
export function withoutSupportedInstructionLength(instructions: string): string | null {
  const cleaned = instructions
    .replace(/\b(create|submit|write)\s+(?:a|an)\s+\d+(?:\s*[-–]\s*\d+)?\s*[-–]?\s*word\s+((?:initial\s+)?discussion\s+post|reply|response)\b/gi, (_match, verb: string, subject: string) => `${verb} ${/^initial\b/i.test(subject) ? "an" : "a"} ${subject}`)
    .replace(/\(\s*\d+\s*[-–]\s*\d+\s+words?\s*\)/gi, "")
    .replace(/(^|[.!?]\s+)the\s+assignment\s+requests\s+at\s+least\s+\d+\s+words?\.(?=\s|$)/gi, "$1")
    .replace(/\b(?:each|every)\s+(?:peer\s+)?(?:response|reply|post)\s+(?:should|must)\s+be\s+\d+(?:\s*[-–]\s*\d+)?\s+words?(?:[.!?](?=\s|$)|\s*$)/gi, "");
  return hasRubricLengthRule(cleaned) ? null : cleaned;
}

/** Remove isolated length phrases from known rating tiers while retaining their substantive descriptions and points. */
export function withoutSupportedRubricLength(rubric: string): string | null {
  const cleaned = rubric.split(/\r?\n/).map((line) => {
    const match = line.match(/^(\s*\d+(?:\.\d+)?\s*(?:pts?|points?)\s+(?:Outstanding|Exceeds Standard|Meets Standard|Approaches Standard|Below Standard|No Evidence)\s+)(.*)$/i);
    if (!match) return line;
    const description = match[2]
      .replace(/^\d+\s+words?\.\s*/i, "")
      .replace(/^(?:slightly|significantly)\s+off\s+word\s+count\s+or\s+/i, "");
    return match[1] + description;
  }).join("\n");
  return hasRubricLengthRule(cleaned) ? null : cleaned;
}

/** Only a narrowly recognized, separately scored length criterion is removable. */
export function extractLengthOnlyExemption(rubric: string, criteria: RubricCriterion[]): { rubric: string; criteria: RubricCriterion[]; exempt: RubricCriterion } | null {
  const candidates = criteria.filter((item) => /^length$/i.test(item.name.trim()) && item.points !== null && item.points > 0);
  if (candidates.length !== 1 || criteria.length < 2 || criteria.some((item) => item.points === null || item.points <= 0)) return null;
  const exempt = candidates[0];
  if (exempt.axis && !criteria.some((item) => item !== exempt && item.axis === exempt.axis)) return null;
  const lines = rubric.split(/\r?\n/);
  // Continuations, tiers, or unparsed text can add substantive requirements to
  // a criterion. Refuse exemption unless every nonblank line is a distinct,
  // point-valued top-level criterion recognized by the existing parser.
  const headings = lines.filter((line) => line.trim() && !isReplySectionMarker(line)).map((line) => line.match(/^([^\s].*?)\s*\(\s*(\d+(?:\.\d+)?)\s*(?:pts?|points?)\s*\)\s*:/i));
  if (headings.length !== criteria.length || headings.some((match) => !match)) return null;
  const names = new Set(headings.map((match) => match![1].trim().toLocaleLowerCase()));
  if (names.size !== criteria.length || criteria.some((item) => !names.has(item.name.trim().toLocaleLowerCase()))) return null;
  const matching = lines.map((line, index) => ({ line, index })).filter(({ line }) => /^length\s*\(/i.test(line.trim()));
  if (matching.length !== 1) return null;
  if (lines.some((line, index) => index !== matching[0].index && hasRubricLengthRule(line))) return null;
  const match = matching[0].line.trim().match(/^length\s*\(\s*(\d+(?:\.\d+)?)\s*(?:pts?|points?)\s*\)\s*:\s*deduct\s+(?:points?\s+)?if\s+(?:fewer|less)\s+than\s+\d+\s+words?\s*\.?$/i);
  if (!match || Number(match[1]) !== exempt.points) return null;
  lines.splice(matching[0].index, 1);
  return { rubric: lines.join("\n"), criteria: criteria.filter((item) => item !== exempt), exempt };
}

/** Do not manufacture a total unless the model returned each substantive criterion exactly once and on its stated scale. */
export function addLengthExemption(areas: RubricAreaResult[], criteria: RubricCriterion[], exempt: RubricCriterion): RubricAreaResult[] | null {
  if (areas.length !== criteria.length || exempt.points === null) return null;
  const normalize = (value: string) => value.trim().toLocaleLowerCase();
  const seen = new Set<string>();
  for (const area of areas) {
    const name = normalize(area.area); const criterion = criteria.find((item) => normalize(item.name) === name);
    const score = area.score.trim().match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
    if (!criterion || seen.has(name) || !score || criterion.points === null || Number(score[2]) !== criterion.points || Number(score[1]) > criterion.points) return null;
    seen.add(name);
  }
  return [...areas, { area: exempt.name, score: `${exempt.points}/${exempt.points}`, comment: "Length deductions are disabled." }];
}
