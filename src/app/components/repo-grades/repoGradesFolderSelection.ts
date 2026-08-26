// Repo Grades view - the pure core of the folder chooser the instructor
// asked for, twice, in their own words:
//   "i should be able to choose which assignment folder i want graded from
//    this view"
//   "i don't want to select an assignment from the lms, i want to select a
//    folder from the repo in the drop down to grade"
// docs/repo-grades-ux-overhaul-acceptance-criteria.md U0a/U0b, U1.1-U1.6d,
// and section 5 ("Data engineering pass and architect revision 3", which
// overrides sections 3 and 4 where they conflict) is the spec this module
// implements. Its exact contract is pinned by repoGradesFolderSelection.test.ts,
// written before this file existed - every function below exists because a
// test in that file names it.
//
// Pure, no I/O, no React - vitest here is node-env and collects only
// src/**/*.test.ts, so every decision this feature needs has to live in a
// module a real test can import, matching repoGradesRows.ts/
// repoGradesBulkGrade.ts's own split.
//
// WHERE THE CENSUS COMES FROM (section 5's settled answer, overriding section
// 3's revision-2 plan to fold it into repoGradesRows.ts's buildRepoGradeColumns):
// `buildFolderOptions` below reads directly off the scan's own repo list
// (the same `{ folders: string[] | null }` shape scanOrgRepoTrees/
// buildRepoGradeColumns already consume - repoGradesRows.ts:120-131), not off
// row.cells. That is a second module, extracted precisely so this feature's
// logic is node-env testable and does not grow repoGradesRows.ts or
// index.tsx past their own limits - section 5's own "extractions to plan now"
// list names this exact file.
//
// A repo whose `folders` is null had its tree fetch FAIL - it is UNKNOWN,
// never "does not have this folder". repoGradesRows.ts:108-112 and
// repoGradesBulkGrade.ts:95-110 both go out of their way to forbid conflating
// the two; this module keeps them just as separate. `unknownRepos` below is
// ONE number for the whole scan, never a per-folder one, because a repo whose
// tree fetch failed is unknown for every folder simultaneously - putting it on
// each option would wrongly imply it can vary between them.

/** The scan row shape this module needs - the same one
 * `buildRepoGradeColumns` (repoGradesRows.ts) already consumes. Kept as a
 * minimal structural type (not imported from `@/lib/repo-grade-tree-scan`)
 * so this module can be handed either the real scan rows or a bare fixture
 * like this file's own test does, with no adapting either way. */
export interface FolderCensusRepo {
  folders: string[] | null;
}

export interface FolderOption {
  folder: string;
  /** How many of the scan's repos actually contain this folder. Never
   * includes a repo whose own tree fetch failed - see `unknownRepos` below. */
  presentIn: number;
}

export interface FolderCensus {
  options: FolderOption[];
  /** How many repos this census was built from, in total (present + absent +
   * unknown, per folder; the scan's own repo count overall). */
  scannedRepos: number;
  /** How many of those repos could not be read at all (folders === null) -
   * ONE number for the whole scan, not per folder (see header comment). */
  unknownRepos: number;
}

/** ALL_FOLDERS is the "view every folder" choice, encoded as an out-of-band
 * string sentinel so it can travel through the exact same `string` channel a
 * real folder name does (a `<select>`'s value, a localStorage cell keyed by
 * courseId - `ta-repo-grades-folder` per the storage design in section 5).
 * Folder names are raw, unconstrained top-level directory segments
 * (repo-assignment-folders.ts), so no printable in-band value ("", "*",
 * "all", "__all__") is safe - any of those could genuinely be a folder some
 * repo has. A leading/trailing U+0000 cannot appear in a GitHub tree path, so
 * this value can never collide with a real folder name. */
export const ALL_FOLDERS = "\u0000__ALL_FOLDERS__\u0000";

// Natural ordering - the SAME comparator repoGradesRows.ts's naturalCompare
// uses (case-insensitive, numeric), duplicated with a comment pointing at the
// source of truth rather than imported, matching that file's own precedent
// for why it duplicates assignmentFoldersFromTree's inline sort instead of
// exporting a standalone comparator from a third place. Keeping the dropdown
// and the grid's columns in agreement about order (U1's "orders options the
// same way the grid orders its columns") requires this to change in lockstep
// with repoGradesRows.ts's copy if that one ever changes.
function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/**
 * The dropdown's contents and the three-way census U1.4 requires: how many
 * scanned repos actually contain each folder, how many were scanned in total,
 * and how many could not be read at all. Folder names are kept RAW and
 * case-SENSITIVE (never normalized) - the same raw string is the assignment-
 * mapping key and the value `buildBulkGradePlan` matches folders on
 * (repoGradesAssignmentMapping.ts, repoGradesBulkGrade.ts), so collapsing
 * "Module-3" and "module-3" into one option here would map ambiguously to two
 * real, distinct columns. Uses a Map (never a plain object) so a folder
 * literally named "constructor" or "toString" cannot resolve through the
 * prototype chain into a bogus, non-zero count.
 */
export function buildFolderOptions(repos: readonly FolderCensusRepo[]): FolderCensus {
  const presentIn = new Map<string, number>();
  let unknownRepos = 0;

  for (const repo of repos) {
    if (repo.folders === null) {
      unknownRepos += 1;
      continue;
    }
    for (const folder of repo.folders) {
      presentIn.set(folder, (presentIn.get(folder) ?? 0) + 1);
    }
  }

  const options = Array.from(presentIn.entries())
    .map(([folder, count]): FolderOption => ({ folder, presentIn: count }))
    .sort((a, b) => naturalCompare(a.folder, b.folder));

  return { options, scannedRepos: repos.length, unknownRepos };
}

/**
 * The dropdown label's own indented display name for a (possibly nested)
 * folder path, e.g. "assignments/module_03" -> an indented "module_03" so
 * sixteen sibling modules under one parent read as a hierarchy rather than
 * sixteen unrelated top-level entries (repo-assignment-folder-paths.ts now
 * offers every depth up to its own maxDepth, not just the top level). Only
 * the LABEL is shortened this way - the option's VALUE stays the full raw
 * path unchanged, since that raw string is the assignment-mapping key and
 * the value buildBulkGradePlan matches folders on (see this module's own
 * header comment on why folder names are kept raw).
 *
 * Uses U+00A0 (non-breaking space) rather than a plain space for the
 * indent: a `<select>`'s rendered option text collapses ordinary whitespace,
 * which would silently erase the indentation this exists to show.
 */
function folderDisplayLabel(folder: string): string {
  const segments = folder.split("/");
  const depth = segments.length - 1;
  const name = segments[depth];
  const indent = "  ".repeat(depth);
  return `${indent}${name}`;
}

/**
 * The dropdown option's own visible text (U1.4) - what an instructor reads
 * BEFORE grading, not after. Always names the folder and how many of the
 * scanned repos have it; only mentions repos that could not be read at all
 * when there were any, so a scan with no failures reads as clean rather than
 * gaining a hedge nobody needs.
 */
export function describeFolderOption(
  option: Pick<FolderOption, "folder" | "presentIn">,
  census: Pick<FolderCensus, "scannedRepos" | "unknownRepos">
): string {
  const { folder, presentIn } = option;
  const { scannedRepos, unknownRepos } = census;
  const absent = Math.max(0, scannedRepos - presentIn - unknownRepos);
  const unknownClause = unknownRepos > 0 ? `; ${unknownRepos} could not be read` : "";
  return `${folderDisplayLabel(folder)} - in ${presentIn} of ${scannedRepos} repos (${absent} without it${unknownClause})`;
}

/**
 * Which folder the dropdown shows as selected, given the current census and
 * whatever was persisted (an empty string for "nothing persisted yet", a raw
 * folder name, or ALL_FOLDERS - never anything else; repoGradesUiState.ts's
 * loadFolderSelection is the only producer of this value outside a test).
 *
 * - No folders at all: always ALL_FOLDERS, regardless of what was persisted
 *   - there is nothing else the control could coherently show (this also
 *     covers a scan that has not settled yet or failed, whose caller passes
 *     an empty options list rather than treating "no options" as a folder
 *     having vanished).
 * - An explicit ALL_FOLDERS choice is always kept.
 * - A persisted folder that still exists (exact, case-SENSITIVE match - see
 *   buildFolderOptions's own comment on why) is kept.
 * - Nothing persisted (""): the FIRST folder in natural order, so the view
 *   opens already scoped (U0a) rather than resting on "All folders" (U0b:
 *   All folders is available, not the default).
 * - Anything else (a persisted folder no longer present): ALL_FOLDERS (U1.6).
 */
export function resolveSelectedFolder(options: readonly FolderOption[], persisted: string): string {
  if (options.length === 0) return ALL_FOLDERS;
  if (persisted === ALL_FOLDERS) return ALL_FOLDERS;
  if (persisted === "") return options[0].folder;
  return options.some((option) => option.folder === persisted) ? persisted : ALL_FOLDERS;
}

/**
 * The rule that stops a keystroke eating the instructor's choice (section 5,
 * "the folder write-back must not fire on a filtered scan"). The org-prefix
 * filter feeds an undebounced onChange and is part of the scan key
 * (useRepoGradesData.ts), so every character re-runs the scan; each of those
 * narrower scans SETTLES SUCCESSFULLY, so a write-back keyed on "any
 * successful scan lacks the persisted folder" would erase the real choice the
 * moment the instructor types one character into the filter - and clearing
 * the filter would not bring it back, since the erasure already reached
 * storage.
 *
 * A folder missing from a PREFIXED scan is merely HIDDEN. A folder missing
 * from an UNFILTERED scan of the whole course is genuinely GONE. Only the
 * second case may be written back to storage; the first must leave the
 * persisted value untouched so clearing the filter resurrects it.
 */
export function shouldPersistFolderDrop(input: { persisted: string; resolved: string; orgPrefix: string }): boolean {
  const { persisted, resolved, orgPrefix } = input;
  if (persisted === "") return false; // nothing was ever set - there is no drop to record
  if (resolved === persisted) return false; // nothing was dropped
  return orgPrefix.trim() === ""; // only an unfiltered scan's drop is genuine
}
