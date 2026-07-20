import type { ScheduleWeekPlan } from "@/app/actions";

export type RubricSubcategory = { label: string; description: string };
export type RubricRow = {
  area: string;
  weight: string;
  description: string;
  subcategories: RubricSubcategory[];
};

export function parseGeneratedRubric(text: string): RubricRow[] | null {
  const lines = text.split("\n");
  const rows: RubricRow[] = [];
  let current: RubricRow | null = null;

  for (const line of lines) {
    if (!line.trim()) continue;

    if (/^\s/.test(line)) {
      if (!current) continue;

      const subLine = line.trim().replace(/^[-•]\s*/, "");
      const subMatch = subLine.match(/^(.+?)\s*:\s*(.+)$/);
      if (subMatch) {
        current.subcategories.push({
          label: subMatch[1].trim(),
          description: subMatch[2].trim(),
        });
      }

      continue;
    }

    const match = line.trim().match(/^(.+?)\s*\((\d+(?:\.\d+)?\s*%?)\)\s*:\s*(.*)$/);
    if (!match) continue;

    if (current) rows.push(current);
    current = {
      area: match[1].trim(),
      weight: match[2].trim(),
      description: match[3].trim(),
      subcategories: [],
    };
  }

  if (current) rows.push(current);

  return rows.length > 0 ? rows : null;
}

/**
 * Build aggregated instruction text from a course description and schedule,
 * in the same block style that the zip-based rubric generation uses.
 * Returns an empty string when there is no description AND no usable weeks.
 */
export function buildRubricSourceFromSchedule(
  courseDescription: string,
  schedule: ScheduleWeekPlan[]
): string {
  const blocks: string[] = [];

  const trimmedDescription = String(courseDescription ?? "").trim();
  if (trimmedDescription) {
    blocks.push(`=== Course description ===\n${trimmedDescription}`);
  }

  for (const week of schedule) {
    const topic = String(week.topic ?? "").trim();
    if (!topic) continue;

    const weekHeader = `=== Week ${String(week.week).padStart(2, "0")}: ${topic} ===`;
    const weekLines: string[] = [weekHeader];

    const summary = String(week.summary ?? "").trim();
    if (summary) {
      weekLines.push(summary);
    }

    const assignmentTitle = String(week.assignmentTitle ?? "").trim();
    if (assignmentTitle) {
      weekLines.push(`Deliverable: ${assignmentTitle}`);
    }

    const testName = String(week.testName ?? "").trim();
    if (testName) {
      weekLines.push(`Assessment: ${testName}`);
    }

    blocks.push(weekLines.join("\n"));
  }

  return blocks.join("\n\n");
}
