// A45 wave 2: the pure leaf that turns the course-roster FormData field into
// the known-student list decideCollisionRefusal corroborates against
// (docs/a45-external-identity-corroboration-scope.md sections 3.2, 5.3).
//
// Pure, no I/O. The client (GradingTab.tsx) sends one student name per line;
// the server actions (gradeAction, prepareGradingRunAction) call
// knownStudentsOption() so each call site is a one-line spread.

import { canonicalizeNameForMatch } from "@/app/components/grading-recording/grading-roster-match";

/** FormData field name carrying the newline-joined known-student names. */
export const KNOWN_STUDENTS_FIELD = "knownStudents";

/** Bounds a hostile or runaway field; far above any real class roster. */
const MAX_KNOWN_STUDENTS = 5000;

/**
 * Splits the field on newlines, trims, drops blanks and de-duplicates by the
 * matcher's own canonical form, because matchNameAgainstRoster requires one
 * entry per DISTINCT student (grading-roster-match.ts:20-28) or an overlapping
 * roster reports every student as ambiguous. First spelling wins.
 */
export function parseKnownStudentNames(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const name = line.trim();
    if (!name) continue;
    const canonical = canonicalizeNameForMatch(name);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    names.push(name);
    if (names.length >= MAX_KNOWN_STUDENTS) break;
  }
  return names;
}

/**
 * `{ knownStudents }` when the field yields at least one name, else `{}` - so
 * "no course selected" leaves the option absent and the collision check runs
 * exactly as it did before A45 (the no-roster degrade).
 */
export function knownStudentsOption(raw: string | null | undefined): { knownStudents?: readonly string[] } {
  const names = parseKnownStudentNames(raw);
  return names.length > 0 ? { knownStudents: names } : {};
}
