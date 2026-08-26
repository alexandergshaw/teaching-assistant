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

// Deliberately a LOCAL duplicate of composeOverallComment
// (src/lib/grade/types.ts), NOT a value import of it via the @/lib/grade
// barrel or any of its submodules. This file is imported by
// GradingResults.tsx, a "use client" component, and that barrel
// transitively imports server-only code: grade.ts -> grade/rubric.ts -> research/rubric-bank.ts
// -> research/db.ts -> src/lib/supabase/server.ts, which imports
// next/headers. A value import of ANYTHING from that barrel drags the whole
// chain into the client bundle - `next build` fails to compile any Pages
// Router entry point reachable from this component, while `npx tsc --noEmit`,
// `npx eslint`, and `npx vitest run` all stay green on the break (none of
// them do bundle analysis). grade.ts's own header comment names this exact
// hazard: "this file transitively imports server-only code and must never
// be VALUE-imported by the client step registry."
//
// This MUST stay byte-identical to composeOverallComment's behaviour (join
// strengths, improvements, resubmitNotice in that exact order with a single
// space, dropping empty parts) - gradingResultsHelpers.test.ts's
// "composeOverallCommentLocal stays byte-identical to composeOverallComment"
// test imports the real one (safe there - test files are not bundled to the
// client) and asserts parity across a table of inputs, so a future edit to
// either implementation that drifts from the other fails loudly. The
// client-bundle-safety guard test in the same file protects against this
// import creeping back in.
export function composeOverallCommentLocal(strengths: string, improvements: string, resubmitNotice: string): string {
  return [strengths, improvements, resubmitNotice]
    .filter((part) => part.trim().length > 0)
    .join(" ")
    .trim();
}

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
//
// `strengths`/`improvements`/`resubmitNotice` are the three independently-
// editable, independently-copyable boxes (A2, docs/grading-results-feedback-
// boxes-acceptance-criteria.md). `overall` is RETAINED - Canvas posting
// (GradingResults.tsx's handlePostGrades/handlePostOne) and the results
// table's "overall" sort column both read it unchanged - but it is now
// DERIVED, never independently authored: applyFeedbackFieldEdit below is the
// ONLY place that writes it, and it always recomputes
// composeOverallComment(strengths, improvements, resubmitNotice) in the same
// step as the field that changed. There is no UI path left that edits
// `overall` directly (the single "Overall feedback" textarea this feature
// replaced was the only one), so it cannot drift from the three boxes.
export type AreaEdit = { score: string };
export type RowEdit = {
  total: string;
  overall: string;
  strengths: string;
  improvements: string;
  resubmitNotice: string;
  areas: Record<string, AreaEdit>;
};

// The three independently-copyable feedback fields, and everything either
// GradingResults.tsx (the per-box expand modal) or RowFeedbackBoxes.tsx (the
// inline boxes) needs to label them - one source of truth so the two files
// can never drift out of sync with each other's wording.
export type FeedbackField = "strengths" | "improvements" | "resubmitNotice";

export const FEEDBACK_FIELDS: readonly FeedbackField[] = ["strengths", "improvements", "resubmitNotice"];

export interface FeedbackFieldMeta {
  /** Visible MUI TextField label, and the expand modal's <h3> heading. */
  fieldLabel: string;
  /** Lowercase, mid-sentence form - "Copy <descriptorLower> for <student>",
   * "Expand <descriptorLower> for <student>" - matching the pre-existing
   * "Copy overall feedback for X" / "Expand overall feedback for X" wording
   * this feature replaces. */
  descriptorLower: string;
  /** Sentence-case, sentence-initial form - "<descriptorCapitalized> for
   * <student>" - matching the pre-existing "Overall feedback for X" wording
   * this feature replaces. Used for the box's own TextField aria-label, the
   * expand modal's dialog label, and the expanded TextField's aria-label. */
  descriptorCapitalized: string;
  /** Copy-button tooltip text, Title Case - matches the pre-existing
   * "Copy Overall Feedback" tooltip this feature replaces. */
  copyTitle: string;
  /** Fallback text copied when the box is empty. "" for resubmitNotice: an
   * empty resubmitNotice means full credit, a DECIDED and meaningful state
   * (A1 item 3) - inventing placeholder text there would misrepresent it as
   * merely unwritten. strengths/improvements are ordinary freeform boxes
   * where "nothing typed yet" has no such meaning, so they keep a generic
   * fallback (matching the pre-existing "No overall feedback provided."). */
  emptyCopyFallback: string;
}

export const FEEDBACK_FIELD_META: Record<FeedbackField, FeedbackFieldMeta> = {
  strengths: {
    fieldLabel: "What Went Well",
    descriptorLower: "what went well",
    descriptorCapitalized: "What went well",
    copyTitle: "Copy What Went Well",
    emptyCopyFallback: "No strengths feedback provided.",
  },
  improvements: {
    fieldLabel: "What Could Be Better",
    descriptorLower: "what could be better",
    descriptorCapitalized: "What could be better",
    copyTitle: "Copy What Could Be Better",
    emptyCopyFallback: "No improvement feedback provided.",
  },
  resubmitNotice: {
    fieldLabel: "Resubmission Note",
    descriptorLower: "resubmission note",
    descriptorCapitalized: "Resubmission note",
    copyTitle: "Copy Resubmission Note",
    // Never invented - see the emptyCopyFallback doc comment above.
    emptyCopyFallback: "",
  },
};

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
      strengths: result.strengths,
      improvements: result.improvements,
      resubmitNotice: result.resubmitNotice,
      areas,
    };
  }
  return seeded;
}

// The all-empty RowEdit used wherever a component needs a fallback for a
// student with no edit yet AND no seeded result to fall back to (e.g. an area
// edit's own local "row" default before seedEdits has run). Matches the
// literal object every one of GradingResults.tsx's updaters used inline
// before this feature added the three feedback fields.
export function blankRowEdit(): RowEdit {
  return { total: "", overall: "", strengths: "", improvements: "", resubmitNotice: "", areas: {} };
}

// The RowEdit a student's own result seeds to, used as a fallback wherever a
// component needs "this student's edit, or their un-edited result" (Canvas
// posting's payload builders) rather than blankRowEdit's all-empty shape.
// Deliberately does NOT populate `areas` from the result's rubricAreas -
// matches the exact fallback object GradingResults.tsx's post handlers used
// inline before this feature, which never populated areas here either (only
// seedEdits does).
export function defaultRowEdit(result: GradeRow): RowEdit {
  return {
    total: result.totalScore,
    overall: result.overallComment,
    strengths: result.strengths,
    improvements: result.improvements,
    resubmitNotice: result.resubmitNotice,
    areas: {},
  };
}

// The ONLY function that writes `overall` (see the RowEdit doc comment
// above) - patches one of the three feedback fields and recomputes `overall`
// as composeOverallComment's output in the same step, so a component that
// calls this can never produce a RowEdit whose `overall` disagrees with its
// three parts.
export function applyFeedbackFieldEdit(row: RowEdit, field: FeedbackField, value: string): RowEdit {
  const next: RowEdit = { ...row, [field]: value };
  next.overall = composeOverallCommentLocal(next.strengths, next.improvements, next.resubmitNotice);
  return next;
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

// A5 item 20 (docs/grading-results-feedback-boxes-acceptance-criteria.md):
// the CSV's decided answer for the three feedback texts is THREE SEPARATE
// COLUMNS, replacing the single "Overall Comment" column this function used
// to write - the composed text (`overallComment`/`edit.overall`) is the
// Canvas comment's decided answer instead (GradingResults.tsx's
// handlePostGrades/handlePostOne, unchanged by this feature). A row's three
// feedback columns read the same edit-takes-priority-over-seeded-value
// pattern the other columns already use.
export function buildCsvContent(run: GradingRun, edits: Record<string, RowEdit>): string {
  const header = ["Student"];
  for (const area of run.rubricAreaNames) {
    header.push(`${area} Score`);
  }
  header.push("Total Score");
  header.push("Strengths");
  header.push("Improvements");
  header.push("Resubmit Notice");
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
    row.push(edit?.strengths ?? result.strengths);
    row.push(edit?.improvements ?? result.improvements);
    row.push(edit?.resubmitNotice ?? result.resubmitNotice);
    row.push(result.submittedFiles.map((file) => file.name).join("; "));
    row.push(Array.from(new Set(result.submittedFiles.map((file) => file.extension))).join("; "));
    rows.push(row.map((cell) => escapeCsvCell(cell)).join(","));
  }

  return rows.join("\n");
}

// ── Persistence (A3) ────────────────────────────────────────────────────
// GradingResults.tsx persisted nothing before this feature - the standing
// project rule (every control persists across reload under a `ta-` key) was
// already violated by the single "Overall feedback" box. Modeled on
// src/app/components/repo-grades/repoGradesUiState.ts's load/persist pairs:
// guarded by `typeof window` so this module stays safe to import from
// server-rendered code, wrapped in try/catch on write so a localStorage
// throw (private browsing, quota) loses one change rather than crashing the
// tab, and - the part that matters most here - never trusts stored data on
// restore (A3 item 13).

// `edits` is keyed by BARE STUDENT NAME (seedEdits above), so the key MUST be
// scoped to the assignment: an unscoped key would leak one assignment's
// feedback onto a different assignment's identically-named student the next
// time that student's name appears under a different course/assignment.
export function gradingResultsEditsKey(canvasUrl: string): string {
  return `ta-grading-results-edits:${canvasUrl}`;
}

function isAreaEditValue(value: unknown): value is AreaEdit {
  return !!value && typeof value === "object" && typeof (value as { score?: unknown }).score === "string";
}

function isAreaEditRecord(value: unknown): value is Record<string, AreaEdit> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value as Record<string, unknown>).every(isAreaEditValue)
  );
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

// Merges one student's STORED row (untyped - it came from JSON.parse on
// localStorage content that could be hand-edited, from an older schema, or
// simply corrupt) onto `fallback` (that student's seeded RowEdit from the
// CURRENT run). Every field is individually validated and falls back on its
// own - a stored row missing `improvements` (an older schema) still keeps
// its valid `strengths`/`resubmitNotice`/`total`/`areas` rather than
// discarding the whole row. `overall` is never read from storage: it is
// always recomputed from the restored strengths/improvements/resubmitNotice,
// so a hand-edited or stale stored `overall` can never desync from the three
// parts it is supposed to compose (the same invariant
// applyFeedbackFieldEdit enforces for live edits).
export function mergeStoredRowEdit(stored: unknown, fallback: RowEdit): RowEdit {
  const record =
    stored && typeof stored === "object" && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  const strengths = stringOr(record.strengths, fallback.strengths);
  const improvements = stringOr(record.improvements, fallback.improvements);
  const resubmitNotice = stringOr(record.resubmitNotice, fallback.resubmitNotice);
  return {
    total: stringOr(record.total, fallback.total),
    strengths,
    improvements,
    resubmitNotice,
    overall: composeOverallCommentLocal(strengths, improvements, resubmitNotice),
    areas: isAreaEditRecord(record.areas) ? (record.areas as Record<string, AreaEdit>) : fallback.areas,
  };
}

// Parses a persisted edits blob against the CURRENT run. Iterates the
// seeded (current-run) students, not the stored blob's own keys, so a
// student who is not in the current run - a stale entry from a previous
// assignment's run under the same key, or a roster change - is silently
// dropped rather than resurrected as a phantom row (A3 item 13). Malformed
// JSON or a non-object top level both degrade to the fully seeded map.
export function loadPersistedEdits(raw: string | null, run: GradingRun): Record<string, RowEdit> {
  const seeded = seedEdits(run);
  if (!raw) return seeded;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return seeded;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return seeded;
  const parsedRecord = parsed as Record<string, unknown>;
  const merged: Record<string, RowEdit> = {};
  for (const [student, fallback] of Object.entries(seeded)) {
    merged[student] = mergeStoredRowEdit(parsedRecord[student], fallback);
  }
  return merged;
}

/** Reads this assignment's persisted edits, validated and merged against the
 * current run (loadPersistedEdits above) - the seeded map (never null/throw)
 * when nothing is stored, `window` is unavailable (SSR), or localStorage
 * itself throws (private browsing). */
export function loadGradingResultsEdits(canvasUrl: string, run: GradingRun): Record<string, RowEdit> {
  if (typeof window === "undefined") return seedEdits(run);
  try {
    return loadPersistedEdits(localStorage.getItem(gradingResultsEditsKey(canvasUrl)), run);
  } catch {
    return seedEdits(run);
  }
}

/** Writes this assignment's edits. Best-effort: a throw (quota, private
 * browsing) loses persistence for this one write and nothing else, matching
 * persistRepoGradesUiState's posture in repoGradesUiState.ts. */
export function persistGradingResultsEdits(canvasUrl: string, edits: Record<string, RowEdit>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(gradingResultsEditsKey(canvasUrl), JSON.stringify(edits));
  } catch {
    // best-effort persistence only, matching persistRepoGradesUiState above.
  }
}
