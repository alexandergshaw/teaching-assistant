// Repo Grades view - AC3 (docs/repo-grades-view-acceptance-criteria.md, items
// 13-14): turning one repo's flat recursive tree path list into the set of
// assignment folders that become the grid's columns. Pure, no I/O - the
// caller has already made the ONE getRepoTreeAction call
// (src/app/actions/github-repos.ts:431) per repo and hands this module the
// resulting paths.
//
// A "folder" here is purely structural, derived from the flat path list
// itself (AC3 item 13 - distinct top-level segments), not from a `type:
// "tree"` tag on a typed tree entry: a top-level segment counts as a
// directory when at least one path in the list has something after it (i.e.
// contains a "/"). A path with no "/" at all is a root-level blob and is
// excluded, matching the whole point of AC3 item 15 - the grid must show a
// missing folder as a distinct "no folder" cell, so a stray root file must
// never masquerade as an assignment folder.

/**
 * Default folders to exclude from assignment-folder discovery. Dot-directories
 * (any top-level segment starting with ".", e.g. ".github", ".vscode") are
 * matched by PREFIX in assignmentFoldersFromTree below, not enumerated here -
 * this set only needs the non-dot conventional non-assignment folders.
 */
export const DEFAULT_IGNORED_REPO_FOLDERS: ReadonlySet<string> = new Set([
  "node_modules",
  "docs",
  "assets",
  "img",
  "images",
]);

/**
 * Distinct top-level directory segments from a repo's flat recursive tree
 * path list, minus `ignore` (defaulting to DEFAULT_IGNORED_REPO_FOLDERS) and
 * every dot-directory, sorted with the SAME natural-numeric comparator
 * listAssignmentFolders (src/app/actions/assignment-content.ts:59-61)
 * already uses, so "week-2" sorts before "week-10" instead of after it.
 */
export function assignmentFoldersFromTree(
  paths: string[],
  ignore: ReadonlySet<string> = DEFAULT_IGNORED_REPO_FOLDERS
): string[] {
  const folders = new Set<string>();

  for (const path of paths) {
    const slashIndex = path.indexOf("/");
    // No "/" at all: a root-level blob, not a folder (AC3 item 15's premise
    // depends on this exclusion being exact).
    if (slashIndex === -1) continue;

    const top = path.slice(0, slashIndex);
    if (!top) continue;
    if (top.startsWith(".")) continue; // dot-directories, matched by prefix
    if (ignore.has(top)) continue;

    folders.add(top);
  }

  return Array.from(folders).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}
