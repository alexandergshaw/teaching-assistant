import { roundTo2 } from "../embedded-grader/format";
import type { RubricAreaResult } from "./types";

function normalizeText(value: unknown): string {
  if (typeof value !== "string") {
    if (typeof value === "number") {
      return String(value);
    }

    return "";
  }

  return value.trim();
}

function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return candidate.slice(start, end + 1);
}

function toRubricAreaResult(value: unknown): RubricAreaResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const item = value as { area?: unknown; score?: unknown; comment?: unknown };
  const area = normalizeText(item.area);

  if (!area) {
    return null;
  }

  return {
    area,
    score: normalizeText(item.score),
    comment: "",
  };
}

export function parseRubricResponse(raw: string): {
  overallComment: string;
  rubricAreas: RubricAreaResult[];
  totalScore: string;
} {
  const jsonText = extractJsonObject(raw);

  if (!jsonText) {
    return {
      overallComment: raw.trim() || "No feedback generated.",
      rubricAreas: [
        {
          area: "Overall",
          score: "",
          comment: raw.trim() || "No feedback generated.",
        },
      ],
      totalScore: "",
    };
  }

  try {
    const parsed = JSON.parse(jsonText) as {
      overallComment?: unknown;
      rubricResults?: unknown;
      totalScore?: unknown;
    };

    const rubricAreas = Array.isArray(parsed.rubricResults)
      ? parsed.rubricResults
          .map((item) => toRubricAreaResult(item))
          .filter((item): item is RubricAreaResult => item !== null)
      : [];

    const overallComment =
      normalizeText(parsed.overallComment) || "No overall comment provided.";

    if (rubricAreas.length === 0) {
      return {
        overallComment,
        rubricAreas: [
          {
            area: "Overall",
            score: "",
            comment: overallComment,
          },
        ],
        totalScore: normalizeText(parsed.totalScore),
      };
    }

    return {
      overallComment,
      rubricAreas,
      totalScore: normalizeText(parsed.totalScore),
    };
  } catch {
    return {
      overallComment: raw.trim() || "No feedback generated.",
      rubricAreas: [
        {
          area: "Overall",
          score: "",
          comment: raw.trim() || "No feedback generated.",
        },
      ],
      totalScore: "",
    };
  }
}

export function parseEarnedPossibleScore(
  score: string
): { earned: number; possible: number } | null {
  const match = score.match(/(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }

  const earned = Number.parseFloat(match[1]);
  const possible = Number.parseFloat(match[2]);

  if (!Number.isFinite(earned) || !Number.isFinite(possible) || possible <= 0) {
    return null;
  }

  return { earned, possible };
}

// True when the graded work lost points (earned < possible). Prefers the total
// score; falls back to summing the per-area scores when the total is unparseable.
export function pointsWereDeducted(
  totalScore: string,
  rubricAreas: RubricAreaResult[]
): boolean {
  const total = parseEarnedPossibleScore(totalScore);
  if (total) {
    return total.earned < total.possible;
  }
  let earned = 0;
  let possible = 0;
  let parsed = 0;
  for (const area of rubricAreas) {
    const p = parseEarnedPossibleScore(area.score);
    if (!p) continue;
    earned += p.earned;
    possible += p.possible;
    parsed += 1;
  }
  return parsed > 0 && earned < possible;
}

function formatScoreNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function deriveTotalScore(
  explicitTotalScore: string,
  rubricAreas: RubricAreaResult[]
): string {
  if (explicitTotalScore.trim()) {
    return explicitTotalScore;
  }

  let earnedTotal = 0;
  let possibleTotal = 0;
  let parsedCount = 0;

  for (const area of rubricAreas) {
    const parsed = parseEarnedPossibleScore(area.score);
    if (!parsed) {
      continue;
    }

    earnedTotal += parsed.earned;
    possibleTotal += parsed.possible;
    parsedCount += 1;
  }

  if (parsedCount === 0 || possibleTotal <= 0) {
    return "";
  }

  return `${formatScoreNumber(earnedTotal)}/${formatScoreNumber(possibleTotal)}`;
}

/**
 * Re-base a graded result onto the assignment's real points_possible so the tool
 * grades out of the same total Canvas shows. The model scores each area against
 * whatever the rubric implied (often /10 each when Canvas has no rubric), so the
 * derived total can be out of, say, 40 when the assignment is worth 20. When a
 * Canvas points_possible is known and differs, scale every area and the total by
 * the same factor; otherwise leave the result untouched (e.g. the zip-upload
 * path, where there is no Canvas total to match).
 */
export function scaleResultToPoints(
  rubricAreas: RubricAreaResult[],
  totalScore: string,
  pointsPossible: number | null | undefined
): { rubricAreas: RubricAreaResult[]; totalScore: string } {
  if (pointsPossible == null || pointsPossible <= 0) {
    return { rubricAreas, totalScore };
  }
  const parsedTotal = parseEarnedPossibleScore(totalScore);
  if (!parsedTotal || parsedTotal.possible === pointsPossible) {
    return { rubricAreas, totalScore };
  }

  const factor = pointsPossible / parsedTotal.possible;

  const scaledAreas = rubricAreas.map((area) => {
    const parsed = parseEarnedPossibleScore(area.score);
    if (!parsed) return area;
    return {
      ...area,
      score: `${formatScoreNumber(roundTo2(parsed.earned * factor))}/${formatScoreNumber(roundTo2(parsed.possible * factor))}`,
    };
  });

  const scaledTotal = `${formatScoreNumber(roundTo2(parsedTotal.earned * factor))}/${formatScoreNumber(pointsPossible)}`;
  return { rubricAreas: scaledAreas, totalScore: scaledTotal };
}

export function formatFeedback(
  overallComment: string,
  rubricAreas: RubricAreaResult[],
  totalScore: string
): string {
  const lines: string[] = [];

  if (totalScore) {
    lines.push(`Total Score: ${totalScore}`);
  }

  for (const area of rubricAreas) {
    if (!area.score.trim()) continue;
    lines.push(`${area.area}: ${area.score}`);
  }

  lines.push(`Overall: ${overallComment}`);
  return lines.join("\n");
}

export function normalizeGeminiError(status: number, errorBody: string): string {
  if (status === 400) {
    let detail = "";

    try {
      const parsed = JSON.parse(errorBody) as { error?: { message?: string } };
      detail = parsed.error?.message?.trim() ?? "";
    } catch {
      detail = errorBody.slice(0, 300).trim();
    }

    const suffix = detail ? ` Gemini said: "${detail}"` : "";
    return `Gemini rejected the request (400). This usually means instructions, rubric, or submission text are too long or contain unsupported content.${suffix}`;
  }

  if (status === 429) {
    return "Gemini quota exceeded for this project. Reduce run size, wait for quota reset, enable billing, or switch providers (for example Groq).";
  }

  if (status === 404 && errorBody.includes("no longer available")) {
    return "The configured Gemini model is not available for this account. Set GEMINI_MODEL to a current model such as gemini-3.1-flash-lite and try again.";
  }

  try {
    const parsed = JSON.parse(errorBody) as {
      error?: {
        message?: string;
      };
    };

    const message = parsed.error?.message?.trim();
    if (message) {
      return `Gemini request failed (${status}): ${message}`;
    }
  } catch {
    // Keep the fallback below when the provider response is not valid JSON.
  }

  return `Gemini request failed (${status}): ${errorBody}`;
}
