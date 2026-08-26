// Pure helpers extracted from GradingResults.tsx (formerly lines ~14-16 and
// ~57-199) as its own change, ahead of the three-feedback-boxes feature
// (docs/grading-results-feedback-boxes-acceptance-criteria.md, A4 item 14).
// GradingResults.tsx was 950 of the project's 1000-line-per-file cap and the
// feature needs roughly 120-150 more lines; this file holds everything that
// GradingResults.tsx used but that touches no React state, no DOM API, and no
// clipboard - so it is a pure MOVE, not a rewrite. Behaviour, exported
// component API, and every user-visible string are unchanged.
//
// This also gives these helpers test coverage for the first time: vitest here
// is node-env and collects only src/**/*.test.ts, so nothing rendered inside
// GradingResults.tsx (a "use client" component) was ever exercised by the
// suite. `buildCsvContent` in particular had zero coverage before this file
// existed, despite owning the CSV-escaping logic for the Export CSV button.
//
// Owns: the run/row type aliases the rest of the grading-results feature
// builds on (GradingRun, GradeRow), the results-table sort model (SortColumn,
// SortDirection, DEFAULT_SORT, sortColumnKey, compareText), the editable-row
// model (AreaEdit, RowEdit, seedEdits, recomputeTotal) and its numeric-parsing
// support (parseEarnedPoints, parseScoreValue, parseDenominator,
// formatPoints), the row-level feedback text formatter (formatFeedback), and
// CSV export (escapeCsvCell, buildCsvContent).
//
// NOTE on formatFeedback: this file's formatFeedback (originally
// GradingResults.tsx:161) collapses em/en dashes in a student's overall
// feedback text into ", " for display - it takes one string and returns one
// string. It is UNRELATED to the differently-shaped formatFeedback exported
// from src/lib/grade/parsing.ts:232, which builds a full feedback block out
// of a comment, rubric areas, and a total score. Do not conflate the two;
// only the local one moved here.
//
// Left behind in GradingResults.tsx (deliberately NOT moved here):
// - PostState (originally :115) models the shape of the component's
//   `postStatus` React state, not the output of any function in this file -
//   none of the helpers below read or produce a PostState.
// - The icon components (:20-53) return JSX and are a different kind of
//   "pure" (pure render, not pure data) that the acceptance criteria's named
//   region (:57-199) does not cover.

import type { GradeActionState } from "../../actions";

// Derived from the action's run shape so this file needs no server-code
// import. GradingResults.tsx imports these two aliases from here instead of
// redefining them, so the run/row shape has one source of truth.
export type GradingRun = NonNullable<GradeActionState["run"]>;
export type GradeRow = GradingRun["results"][number];

// ── Sort helpers ───────────────────────────────────────────────────────────

export type SortDirection = "asc" | "desc";

export type SortColumn =
  | { kind: "student" }
  | { kind: "files" }
  | { kind: "rubric"; area: string }
  | { kind: "total" }
  | { kind: "overall" };

export const DEFAULT_SORT: { column: SortColumn; direction: SortDirection } = {
  column: { kind: "student" },
  direction: "asc",
};

export function sortColumnKey(column: SortColumn): string {
  return column.kind === "rubric" ? `rubric:${column.area}` : column.kind;
}

export function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

// Pull the earned points out of a score string ("8/10" -> "8", "85%" -> "85").
export function parseEarnedPoints(total: string): string {
  const fraction = total.match(/(-?\d+(?:\.\d+)?)\s*\/\s*-?\d+/);
  if (fraction) return fraction[1];
  const num = total.match(/-?\d+(?:\.\d+)?/);
  return num ? num[0] : "";
}

export function parseScoreValue(value: string): number | null {
  const match = value.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[0]);
  return Number.isNaN(parsed) ? null : parsed;
}

// Editable grade, overall comment, and per-criterion scores per student
// (keyed by student name, then by rubric area name).
export type AreaEdit = { score: string };
export type RowEdit = { total: string; overall: string; areas: Record<string, AreaEdit> };

export function seedEdits(run: GradingRun): Record<string, RowEdit> {
  const seeded: Record<string, RowEdit> = {};
  for (const result of run.results) {
    const areas: Record<string, AreaEdit> = {};
    for (const area of result.rubricAreas) {
      areas[area.area] = { score: area.score };
    }
    seeded[result.student] = {
      total: result.totalScore,
      overall: result.overallComment,
      areas,
    };
  }
  return seeded;
}

// The denominator of a "X/Y" score, or null when there is no "/Y" part.
export function parseDenominator(value: string): number | null {
  const match = value.match(/\/\s*(-?\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

// Format a points number without trailing-zero noise (8 -> "8", 7.5 -> "7.5").
export function formatPoints(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

// Recompute a student's total as the sum of their per-criterion earned points.
// Keeps the existing total's denominator when it has one (e.g. "17/20"); else
// uses the summed criterion denominators when every criterion supplies one.
// Returns the current total unchanged when no criterion has a numeric score.
export function recomputeTotal(
  areas: Record<string, AreaEdit>,
  areaNames: string[],
  currentTotal: string
): string {
  let earned = 0;
  let sawNumber = false;
  let denomSum = 0;
  let everyHasDenom = true;
  for (const name of areaNames) {
    const score = areas[name]?.score ?? "";
    if (!score.trim()) {
      everyHasDenom = false;
      continue;
    }
    const e = parseScoreValue(score);
    if (e !== null) {
      earned += e;
      sawNumber = true;
    }
    const d = parseDenominator(score);
    if (d !== null) denomSum += d;
    else everyHasDenom = false;
  }
  if (!sawNumber) return currentTotal;
  const denom = parseDenominator(currentTotal) ?? (everyHasDenom ? denomSum : null);
  return denom !== null ? `${formatPoints(earned)}/${formatPoints(denom)}` : formatPoints(earned);
}

// NOT the parsing.ts formatFeedback - see the file header note above.
export function formatFeedback(text: string): string {
  return text.replace(/\s*[–—]\s*/g, ", ");
}

export function escapeCsvCell(value: string): string {
  const sanitized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return `"${sanitized.replace(/"/g, '""')}"`;
}

export function buildCsvContent(run: GradingRun, edits: Record<string, RowEdit>): string {
  const header = ["Student"];
  for (const area of run.rubricAreaNames) {
    header.push(`${area} Score`);
  }
  header.push("Total Score");
  header.push("Overall Comment");
  header.push("Submitted Files");
  header.push("Submitted Extensions");

  const rows = [header.map((cell) => escapeCsvCell(cell)).join(",")];

  for (const result of run.results) {
    const edit = edits[result.student];
    const row: string[] = [result.student];
    const areaMap = new Map(result.rubricAreas.map((area) => [area.area, area]));
    for (const areaName of run.rubricAreaNames) {
      const area = areaMap.get(areaName);
      const areaEdit = edit?.areas?.[areaName];
      row.push(areaEdit?.score ?? area?.score ?? "");
    }
    row.push(edit?.total ?? result.totalScore);
    row.push(edit?.overall ?? result.overallComment);
    row.push(result.submittedFiles.map((file) => file.name).join("; "));
    row.push(Array.from(new Set(result.submittedFiles.map((file) => file.extension))).join("; "));
    rows.push(row.map((cell) => escapeCsvCell(cell)).join(","));
  }

  return rows.join("\n");
}
