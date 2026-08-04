// Schedule <-> CSV conversion, split out of types.ts (that file was over the
// 1000-line cap - see docs/REGRESSION.md's line-count discipline). Re-exported
// from types.ts under their original names, so every existing import site
// keeps resolving through "@/lib/workflows/types" unchanged.
import type { ScheduleWeekPlan } from "@/app/actions";
import { parseCsvRows } from "@/lib/csv";

/**
 * Convert a schedule array to CSV format.
 * Header: Week,Topic,Summary,Assignment,Test
 * One row per week with CSV-escaped values.
 */
export function scheduleToCsv(schedule: ScheduleWeekPlan[]): string {
  const csvEscape = (value: string | null): string => {
    if (!value) return "";
    const v = String(value);
    // A bare \r is a row break to parseCsvRows, so it must be quoted too.
    if (
      v.includes(",") ||
      v.includes('"') ||
      v.includes("\n") ||
      v.includes("\r")
    ) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };

  const rows: string[] = ["Week,Topic,Summary,Assignment,Test"];
  for (const week of schedule) {
    const row = [
      String(week.week),
      csvEscape(week.topic),
      csvEscape(week.summary),
      csvEscape(week.assignmentTitle),
      csvEscape(week.testName),
    ].join(",");
    rows.push(row);
  }

  return rows.join("\n");
}

// Inverse of scheduleToCsv minus assignmentSlug. Used by the Schedule of Topics
// fallback and safe on arbitrary user-uploaded CSVs.
export function csvToSchedule(csv: string): ScheduleWeekPlan[] {
  const rows = parseCsvRows(csv);

  // Drop rows whose cells are all empty strings.
  const nonEmpty = rows.filter((row: string[]) =>
    row.some((cell: string) => cell.trim().length > 0)
  );

  if (nonEmpty.length === 0) {
    return [];
  }

  // The first remaining row is the header. Build a column index.
  const headerRow = nonEmpty[0];
  const columnIndex: Record<string, number> = {};

  for (let i = 0; i < headerRow.length; i++) {
    const normalized = headerRow[i].trim().toLowerCase();
    if (
      normalized === "week" ||
      normalized === "topic" ||
      normalized === "summary" ||
      normalized === "assignment" ||
      normalized === "test"
    ) {
      columnIndex[normalized] = i;
    }
  }

  // If there is no header row or it lacks BOTH "week" and "topic" columns, return [].
  if (!("week" in columnIndex) || !("topic" in columnIndex)) {
    return [];
  }

  const result: ScheduleWeekPlan[] = [];

  for (let i = 1; i < nonEmpty.length; i++) {
    const row = nonEmpty[i];

    // Parse week; skip rows where week is not an integer >= 1. Number (not
    // parseInt) so fractional weeks like "1.5" are skipped, not truncated.
    const weekCell = (row[columnIndex["week"]] ?? "").trim();
    const week = Number(weekCell);
    if (!Number.isInteger(week) || week < 1) {
      continue;
    }

    const topic = (row[columnIndex["topic"]] ?? "").trim();
    const summary = (row[columnIndex["summary"] ?? -1] ?? "").trim();
    const assignmentCell = (row[columnIndex["assignment"] ?? -1] ?? "").trim();
    const testCell = (row[columnIndex["test"] ?? -1] ?? "").trim();

    result.push({
      week,
      topic,
      summary,
      assignmentTitle: assignmentCell || null,
      assignmentSlug: null,
      testName: testCell || null,
    });
  }

  return result;
}
