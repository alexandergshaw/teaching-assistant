import type { RubricAreaResult, RubricCriterion } from "./types";
import { normalizeAreaName } from "./prompts";

export type RepositoryProposalOutputFailure = "invalid-json" | "invalid-criteria" | "invalid-feedback" | "invalid-results" | "invalid-score" | "invalid-evidence" | "output-cap";
export type RepositoryProposalAxisScore = {
  rubricAreas: RubricAreaResult[];
  strengths: string;
  improvements: string;
  modelTotalScore: string;
  overallComment: string;
  separateStrengths?: string;
};
export type RepositoryProposalOutputResult = { ok: true; value: RepositoryProposalAxisScore } | { ok: false; reason: RepositoryProposalOutputFailure };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const fields = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean => required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const refusal = (reason: RepositoryProposalOutputFailure): RepositoryProposalOutputResult => ({ ok: false, reason });

/** Consume untouched provider JSON before legacy parsing can discard malformed rows or comments. */
export function parseRepositoryProposalOutput(raw: string, auditedCriteria: readonly RubricCriterion[], allowedEvidenceIds: ReadonlySet<string> | readonly string[]): RepositoryProposalOutputResult {
  if (new TextEncoder().encode(raw).byteLength > 262_144) return refusal("output-cap");
  if (!auditedCriteria.length) return refusal("invalid-criteria");
  const criterionKeys = new Set<string>();
  for (const criterion of auditedCriteria) {
    const key = normalizeAreaName(criterion.name);
    if (!key || criterionKeys.has(key) || !finite(criterion.points) || criterion.points < 0) return refusal("invalid-criteria");
    criterionKeys.add(key);
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return refusal("invalid-json"); }
  if (!object(parsed) || !fields(parsed, ["overallComment", "improvements", "rubricResults"], ["strengths"])) return refusal("invalid-feedback");
  if (typeof parsed.overallComment !== "string" || !parsed.overallComment.trim() || typeof parsed.improvements !== "string" || (Object.hasOwn(parsed, "strengths") && (typeof parsed.strengths !== "string" || !parsed.strengths.trim()))) return refusal("invalid-feedback");
  if (!Array.isArray(parsed.rubricResults) || parsed.rubricResults.length !== auditedCriteria.length) return refusal("invalid-results");
  const evidenceIds = new Set(allowedEvidenceIds);
  const seen = new Set<string>(); const rubricAreas: RubricAreaResult[] = [];
  let earnedTotal = 0; let possibleTotal = 0;
  for (let index = 0; index < parsed.rubricResults.length; index += 1) {
    const row: unknown = parsed.rubricResults[index]; const criterion = auditedCriteria[index];
    if (!object(row) || !fields(row, ["area", "score", "comment"]) || typeof row.area !== "string") return refusal("invalid-results");
    const normalized = normalizeAreaName(row.area);
    if (row.area !== criterion.name || !normalized || seen.has(normalized)) return refusal("invalid-results");
    seen.add(normalized);
    if (!object(row.score) || !fields(row.score, ["earned", "possible"]) || !finite(row.score.earned) || !finite(row.score.possible) || row.score.possible !== criterion.points || row.score.earned < 0 || row.score.earned > row.score.possible) return refusal("invalid-score");
    if (typeof row.comment !== "string" || !row.comment.trim()) return refusal("invalid-evidence");
    const citations = [...row.comment.matchAll(/\[evidence:([^\]\r\n]+)\]/g)];
    const rationale = row.comment.replace(/\[evidence:([^\]\r\n]+)\]/g, "");
    if (!citations.length || !rationale.trim() || /\[evidence/i.test(rationale) || citations.some((citation) => !evidenceIds.has(citation[1]))) return refusal("invalid-evidence");
    earnedTotal += row.score.earned; possibleTotal += row.score.possible;
    if (!Number.isFinite(earnedTotal) || !Number.isFinite(possibleTotal)) return refusal("invalid-score");
    rubricAreas.push({ area: row.area, score: `${row.score.earned}/${row.score.possible}`, comment: row.comment });
  }
  return { ok: true, value: {
    rubricAreas, strengths: parsed.overallComment, improvements: parsed.improvements,
    modelTotalScore: `${earnedTotal}/${possibleTotal}`, overallComment: parsed.overallComment,
    ...(typeof parsed.strengths === "string" ? { separateStrengths: parsed.strengths } : {}),
  } };
}