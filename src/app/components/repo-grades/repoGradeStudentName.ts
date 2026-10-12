// Repo Grades view - N2/N3 (docs/repo-grades-name-columns-and-sorting-
// acceptance-criteria.md): the ONE place first/last name text is derived.
// The name columns are gone from the table (docs/repo-grades-table-header-
// cleanup-scope.md); this derivation now feeds search (repoGradesSearch.ts)
// so a repo can still be found by a student's name.
//
// Input is `row.binding.student` - and, when the roster match that produced
// it carried one, `row.binding.studentSortable` (Canvas's own sortable_name,
// "Last, First" - see src/lib/repo-student-bindings.ts) - and NOTHING ELSE
// (N3 item 7). `binding.student` IS the roster-derived value this view
// already bridges via overlayRosterUsernames (useRepoGradesData.ts); an
// independent `course.roster` lookup here is exactly how the name columns
// could show something that disagrees with the binding the row carries.
//
// Pure, no I/O, no React - repoGradeStudentName.test.ts is this module's
// specification.

/**
 * Where a row's first/last split came from.
 */
export type RepoGradeStudentNameSource =
  | "none" // no name at all - a repo with no roster match (N3 item 8)
  | "canvas" // split from Canvas's own sortableName ("Last, First") - N2 item 6
  | "explicit" // the instructor wrote "Last, First" themselves - the comma convention (N2 item 3)
  | "derived" // no comma; the last-word rule guessed the split - shown WITH a marker (N2 item 4)
  | "single"; // one token; the last name is unknown - never guessed (N2 item 4)

export interface RepoGradeStudentNameParts {
  /** "" only for source "none". */
  firstName: string;
  /** "" for source "none" or "single". */
  lastName: string;
  source: RepoGradeStudentNameSource;
  /** Non-null only when source === "derived" - N2 item 4's required
   * correction instruction, in words the instructor can act on. */
  correctionHint: string | null;
}

function splitTokens(value: string): string[] {
  return value.split(/\s+/).filter(Boolean);
}

/**
 * The shared split rules (N2 item 4), applied to whichever single display
 * string the caller below decided to read:
 *   - a comma splits "Last, First" at the FIRST comma - "explicit": the
 *     instructor (or Canvas) said so, no guessing involved.
 *   - no comma, two or more tokens: the last-word rule - "derived", with a
 *     correction hint.
 *   - exactly one token: the last name is unknown - "single", never guessed.
 *   - nothing at all: "none".
 */
function deriveFromDisplayName(name: string): RepoGradeStudentNameParts {
  const commaIndex = name.indexOf(",");
  if (commaIndex !== -1) {
    const last = name.slice(0, commaIndex).trim();
    const first = name.slice(commaIndex + 1).trim();
    return { firstName: first, lastName: last, source: "explicit", correctionHint: null };
  }

  const tokens = splitTokens(name);
  if (tokens.length >= 2) {
    const last = tokens[tokens.length - 1];
    const first = tokens.slice(0, -1).join(" ");
    return {
      firstName: first,
      lastName: last,
      source: "derived",
      correctionHint:
        `Guessed by treating the last word of "${name}" as the surname - if that is wrong ` +
        `(for example, a multi-part surname), correct it in the roster as "${last}, ${first}".`,
    };
  }

  if (tokens.length === 1) {
    return { firstName: tokens[0], lastName: "", source: "single", correctionHint: null };
  }

  return { firstName: "", lastName: "", source: "none", correctionHint: null };
}

/**
 * Derives display-ready first/last name parts for one row
 * (N3 item 7: reads `student`, and nothing else besides the SAME binding's
 * own `studentSortable`).
 *
 * N2 item 6: prefers Canvas's own `sortableName` when the roster match that
 * produced `student` carried one - Canvas already holds the real split, so a
 * comma found in IT is never marked "derived" (it renamed to "canvas"
 * instead of "explicit" below - the instructor did not type it, but it is
 * just as authoritative). Falls back to deriving from `student` itself when
 * `sortableName` is absent, blank, or itself carries no comma (rare - some
 * Canvas accounts have no real sortable_name split either; that case is
 * still marked "derived"/"single" exactly like deriving from a plain typed
 * name would be, since no comma means no confirmed split either way).
 */
export function deriveRepoGradeStudentName(
  student: string | null | undefined,
  sortableName?: string | null
): RepoGradeStudentNameParts {
  const trimmedSortable = (sortableName ?? "").trim();
  if (trimmedSortable) {
    const parts = deriveFromDisplayName(trimmedSortable);
    return parts.source === "explicit" ? { ...parts, source: "canvas" } : parts;
  }

  const trimmedStudent = (student ?? "").trim();
  if (!trimmedStudent) return { firstName: "", lastName: "", source: "none", correctionHint: null };
  return deriveFromDisplayName(trimmedStudent);
}
