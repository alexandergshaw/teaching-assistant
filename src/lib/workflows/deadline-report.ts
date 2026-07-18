/**
 * Pure module for filtering and formatting deadline reports.
 */

export interface DeadlineSection {
  course: string; // label: course URL or "ACRONYM course name"
  error?: string; // present when the fetch failed
  assignments: Array<{ name: string; dueAt: string }>; // already-filtered
}

/**
 * Filter assignments to those with a due date within the upcoming window.
 * - Keeps dueAt !== null
 * - Keeps only assignments due between nowMs (inclusive) and nowMs + days*864e5 (inclusive)
 * - Returns sorted by dueAt ascending
 */
export function filterUpcoming(
  assignments: Array<{ name: string; dueAt: string | null }>,
  nowMs: number,
  days: number
): Array<{ name: string; dueAt: string }> {
  const cutoffMs = nowMs + days * 864e5; // 864e5 = 24 * 60 * 60 * 1000

  const filtered = assignments
    .filter((a): a is { name: string; dueAt: string } => a.dueAt !== null)
    .filter((a) => {
      const dueMs = Date.parse(a.dueAt);
      return dueMs >= nowMs && dueMs <= cutoffMs;
    })
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));

  return filtered;
}

/**
 * Format deadline sections into a report.
 * - Per section WITH assignments: header line `${course}:` (only when more than one section)
 *   then `- ${name} - due ${new Date(dueAt).toLocaleString()}`
 * - Per section WITH error: line `${course}: ${error}` - ALWAYS kept in deadlines
 * - count = total assignments; problems = error sections
 * - When count === 0: deadlines starts with `No deadlines in the next ${days} day(s).`
 *   and when problems > 0, followed by error lines plus final line
 *   `${problems} course(s) could not be checked.`
 * - items = the per-assignment lines only (for the list summary)
 */
export function formatDeadlineReport(
  sections: DeadlineSection[],
  days: number
): { deadlines: string; count: number; problems: number; items: string[] } {
  let count = 0;
  let problems = 0;
  const items: string[] = [];
  const lines: string[] = [];

  const hasMultipleSections = sections.length > 1;

  // Process each section
  for (const section of sections) {
    if (section.error) {
      // Section with error: always include the error line
      lines.push(`${section.course}: ${section.error}`);
      problems++;
    } else if (section.assignments.length > 0) {
      // Section with assignments
      if (hasMultipleSections) {
        lines.push(`${section.course}:`);
      }
      for (const assignment of section.assignments) {
        const dueDateStr = new Date(assignment.dueAt).toLocaleString();
        const itemLine = `- ${assignment.name} - due ${dueDateStr}`;
        lines.push(itemLine);
        items.push(itemLine);
        count++;
      }
    }
  }

  // Build the deadlines string
  let deadlines: string;

  if (count === 0) {
    // No deadlines found
    deadlines = `No deadlines in the next ${days} day(s).`;

    if (problems > 0) {
      // Append error lines
      deadlines += "\n" + lines.join("\n");
      deadlines += `\n${problems} course(s) could not be checked.`;
    }
  } else {
    // Deadlines found
    deadlines = lines.join("\n");
  }

  return { deadlines, count, problems, items };
}
