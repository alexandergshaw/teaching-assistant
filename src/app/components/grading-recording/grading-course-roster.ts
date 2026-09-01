// Grading from a screen recording - roster NAMES for R3a's client-side
// roster check (docs/grading-via-recording-acceptance-criteria.md section 3:
// "rosters exist client-side (course.roster, studentRepos) ... Check the
// read name against the roster when one is available").
//
// `Course.roster` (src/lib/supabase/courses.row.ts) is a free-text field,
// one student per line, optionally "Name | githubusername" - the same shape
// `parseRosterLines` (src/lib/workflows/registry-helpers.ts) already reads
// for workflow steps. This file does NOT import that function: registry-
// helpers.ts pulls in a large tree of server-only workflow-step machinery
// (course-hub actions, schedule types, cartridge import types) that has no
// place in a client bundle for the sake of reusing three lines of string
// splitting - see AGENTS.md's registry-client-bundle-guard note. Written
// fresh here instead, dependency-free.
//
// matchNameAgainstRoster's own contract (grading-roster-match.ts) requires
// one entry per DISTINCT roster student - two identical lines for the same
// person would misreport that single student as "ambiguous" against
// themselves - so this always de-duplicates before returning.

/**
 * Turns a course's free-text roster field into a plain, de-duplicated list
 * of student names (the "Name" half of each "Name | username" line, or the
 * whole trimmed line when there is no "|"). `null`/`undefined`/blank all
 * produce an empty list - matchNameAgainstRoster already treats an empty
 * list the same as "no roster available" (its own "no-roster" outcome), so
 * this function does not need to distinguish "no course selected" from
 * "course has an empty roster field" itself.
 */
export function parseRosterNames(rosterText: string | null | undefined): string[] {
  if (!rosterText) return [];
  const names = rosterText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.lastIndexOf("|");
      return (idx === -1 ? line : line.slice(0, idx)).trim();
    })
    .filter(Boolean);
  return Array.from(new Set(names));
}
