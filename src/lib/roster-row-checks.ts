// Pure row-hygiene checks for the Roster editor (R8): duplicate detection on
// normalized name and lowercased handle. Reported as a WARNING naming the
// consequence, never a block on Save - two identical names collide onto one
// generated repo (studentRepoName), which is worth surfacing but is not this
// editor's business to prevent (the instructor may be mid-correction, or the
// collision may be intentional, e.g. two rows for one student's two repos).
import { repoSlug } from "./student-repo-names";

export interface RosterDuplicateIndex {
  /** Roster row indexes (into the array passed in) whose normalized student
   * name matches another row's. */
  duplicateNameIndexes: Set<number>;
  /** Roster row indexes whose lowercased GitHub handle matches another
   * row's. */
  duplicateHandleIndexes: Set<number>;
}

function normalizeStudentName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Both indexes of a name/handle collision are marked, not just the second
 * occurrence - the first row is just as much a party to the collision, and
 * hiding its own warning would make the two rows disagree about whether a
 * problem exists. */
export function findRosterRowDuplicates(
  rows: Array<{ student: string; username: string }>
): RosterDuplicateIndex {
  const nameSeenAt = new Map<string, number>();
  const handleSeenAt = new Map<string, number>();
  const duplicateNameIndexes = new Set<number>();
  const duplicateHandleIndexes = new Set<number>();

  rows.forEach((row, index) => {
    const nameKey = normalizeStudentName(row.student);
    if (nameKey) {
      const firstAt = nameSeenAt.get(nameKey);
      if (firstAt !== undefined) {
        duplicateNameIndexes.add(firstAt);
        duplicateNameIndexes.add(index);
      } else {
        nameSeenAt.set(nameKey, index);
      }
    }

    const handleKey = row.username.trim().toLowerCase();
    if (handleKey) {
      const firstAt = handleSeenAt.get(handleKey);
      if (firstAt !== undefined) {
        duplicateHandleIndexes.add(firstAt);
        duplicateHandleIndexes.add(index);
      } else {
        handleSeenAt.set(handleKey, index);
      }
    }
  });

  return { duplicateNameIndexes, duplicateHandleIndexes };
}

/** A human-readable warning for one row, or null when it carries no
 * collision. Names the concrete consequence (the shared repo suffix) rather
 * than just saying "duplicate," per AC5.1a's "one cause per message, name
 * the fix" idiom used elsewhere in this feature. */
export function describeRosterDuplicate(
  row: { student: string; username: string },
  index: number,
  duplicates: RosterDuplicateIndex
): string | null {
  const isNameDup = duplicates.duplicateNameIndexes.has(index);
  const isHandleDup = duplicates.duplicateHandleIndexes.has(index);
  if (!isNameDup && !isHandleDup) return null;

  const suffix = repoSlug(row.student.trim() || row.username.trim()) || "student";
  if (isNameDup && isHandleDup) {
    return `Same name and GitHub username as another row - both would use the repo suffix "${suffix}".`;
  }
  if (isNameDup) {
    return `Same name as another row - both would generate the repo suffix "${suffix}".`;
  }
  return `Same GitHub username as another row.`;
}
