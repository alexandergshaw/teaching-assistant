// Pure table-derived stats for the run-input prompt's table view (visible-row
// filtering/sorting, grade stats, grade distribution). Extracted out of
// useRunInputPrompt.ts's useMemo bodies so this logic is unit-testable
// without a DOM/React harness (vitest.config.ts runs tests under a plain
// "node" environment) - the hook still computes these inside its own
// useMemo calls, unchanged, it just delegates the computation to these
// functions instead of inlining it.
export interface TableInputColumn {
  key: string;
  link?: boolean;
}

export interface TableInputShape {
  kind: string;
  columns?: TableInputColumn[];
}

export interface VisibleTableRow {
  row: Record<string, string>;
  index: number;
}

/**
 * The run-input table's visible rows: frozen order (once the user has
 * started acting on rows) takes priority over live search/sort, otherwise
 * search-filters then sorts the full row list. Mirrors the original inline
 * useMemo exactly.
 */
export function computeVisibleTableRows(
  runInput: TableInputShape | null,
  runInputRows: Array<Record<string, string>>,
  runInputSearch: string,
  runInputSort: { key: string; dir: "asc" | "desc" } | null,
  tableFrozenOrder: number[] | null
): VisibleTableRow[] {
  if (!runInput || runInput.kind !== "table") return [];
  if (tableFrozenOrder) {
    return tableFrozenOrder
      .map((index) => ({ row: runInputRows[index], index }))
      .filter((entry) => entry.row !== undefined);
  }
  const query = runInputSearch.trim().toLowerCase();
  let list = runInputRows.map((row, index) => ({ row, index }));
  if (query) {
    const keys = (runInput.columns ?? []).filter((c) => !c.link).map((c) => c.key);
    list = list.filter(({ row }) => keys.some((k) => (row[k] ?? "").toLowerCase().includes(query)));
  }
  if (runInputSort) {
    const { key, dir } = runInputSort;
    list = [...list].sort((a, b) => {
      const na = parseFloat(a.row[key] ?? "");
      const nb = parseFloat(b.row[key] ?? "");
      const aNum = (a.row[key] ?? "").trim() !== "" && Number.isFinite(na);
      const bNum = (b.row[key] ?? "").trim() !== "" && Number.isFinite(nb);
      let cmp: number;
      if (aNum && bNum) cmp = na - nb;
      else if (aNum) cmp = -1;
      else if (bNum) cmp = 1;
      else cmp = (a.row[key] ?? "").localeCompare(b.row[key] ?? "");
      return (dir === "asc" ? 1 : -1) * cmp;
    });
  }
  return list;
}

export interface GradeStats {
  invalid: number;
  missing: number;
  avg: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
}

/**
 * The single source of truth for what makes a grade cell "invalid": not
 * numeric, negative, or exceeding a positive outOf. An EMPTY grade is not an
 * issue by this rule (post-grades deliberately supports comment-only posting
 * with no score) - callers that care about "missing" check that separately.
 * Mirrored 1:1 by tableGradeIssue in run-results.tsx, which delegates to this
 * function so the two files cannot drift out of sync again - this is the one
 * place the rule is written out.
 */
export function gradeIssue(row: Record<string, string>): string | null {
  const raw = (row.grade ?? "").trim();
  if (raw === "") return null;
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return "not a number";
  const grade = parseFloat(raw);
  const outOf = parseFloat((row.outOf ?? "").trim());
  if (grade < 0) return "below 0";
  if (Number.isFinite(outOf) && grade > outOf) return `above ${outOf}`;
  return null;
}

/**
 * Aggregate grade stats (invalid/missing counts, avg/median/min/max of the
 * valid grades) across the table's rows. Null when the table has no "grade"
 * column. Mirrors the original inline useMemo exactly.
 */
export function computeGradeStats(
  tableHasGrade: boolean,
  runInputRows: Array<Record<string, string>>
): GradeStats | null {
  if (!tableHasGrade) return null;
  const values: number[] = [];
  let invalid = 0;
  let missing = 0;
  for (const row of runInputRows) {
    const raw = (row.grade ?? "").trim();
    if (raw === "") {
      missing += 1;
      continue;
    }
    if (gradeIssue(row) !== null) {
      invalid += 1;
      continue;
    }
    values.push(parseFloat(raw));
  }
  if (values.length === 0) {
    return { invalid, missing, avg: null, median: null, min: null, max: null };
  }
  const sorted = [...values].sort((x, y) => x - y);
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  const median =
    sorted.length % 2 === 1
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  return { invalid, missing, avg, median, min: sorted[0], max: sorted[sorted.length - 1] };
}

export type GradeBand = "success" | "accent" | "warning" | "danger";

export interface GradeDistribution {
  total: number;
  segments: Array<{ band: GradeBand; label: string; count: number }>;
  ariaLabel: string;
}

/**
 * Buckets the table's valid grades into four percentage bands. Null when the
 * table has no "grade" column, or when no row has both a grade and a
 * positive "outOf" to compute a percentage from. A row gradeIssue flags as
 * invalid (non-numeric, negative, or over outOf) is excluded entirely rather
 * than banded - matches tableGradeBand in run-results.tsx exactly (which
 * buckets a row as "neutral" - i.e. excluded from the bar - under the same
 * conditions).
 */
export function computeGradeDistribution(
  tableHasGrade: boolean,
  runInputRows: Array<Record<string, string>>
): GradeDistribution | null {
  if (!tableHasGrade) return null;
  const counts: Record<GradeBand, number> = {
    success: 0,
    accent: 0,
    warning: 0,
    danger: 0,
  };
  for (const row of runInputRows) {
    const raw = (row.grade ?? "").trim();
    if (raw === "" || gradeIssue(row) !== null) continue;
    const outOf = parseFloat((row.outOf ?? "").trim());
    if (!Number.isFinite(outOf) || outOf <= 0) continue;
    const pct = (parseFloat(raw) / outOf) * 100;
    const band: GradeBand = pct >= 90 ? "success" : pct >= 80 ? "accent" : pct >= 70 ? "warning" : "danger";
    counts[band] += 1;
  }
  const total = counts.success + counts.accent + counts.warning + counts.danger;
  if (total === 0) return null;
  const segments: Array<{ band: GradeBand; label: string; count: number }> = [
    { band: "success", label: "90%+", count: counts.success },
    { band: "accent", label: "80-89%", count: counts.accent },
    { band: "warning", label: "70-79%", count: counts.warning },
    { band: "danger", label: "below 70%", count: counts.danger },
  ];
  return {
    total,
    segments,
    ariaLabel: segments.map((s) => `${s.count} at ${s.label}`).join(", "),
  };
}
