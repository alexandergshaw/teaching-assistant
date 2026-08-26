// Repo Grades view - fix for the owner's 2026-08-26 report: "the assignment
// folder to grade selector should allow me to select a subfolder within the
// assignments folder." See repo-assignment-folder-paths.test.ts (written
// first) for the full defect writeup and the owner's real repo shape:
//
//     assignments/module_01 ... assignments/module_16
//     tests/
//     .github/workflows/
//
// `assignmentFoldersFromTree` (repo-assignment-folders.ts:38-59) keeps only
// the FIRST path segment, so that repo could only ever offer one folder,
// "assignments" - every module got graded together as a single submission.
// The grading path itself already supports a nested scope (`ingestRepo`'s
// `pathPrefix` is a plain `string.startsWith` filter - see
// github-grading-folder.ts:29-32 and github.digest.ts:75), so this is purely
// a DISCOVERY fix: offer every folder up to `maxDepth` levels deep, not just
// the top one.
//
// This module is path-based rather than reusing `buildRepoFolderTree`
// (repo-folder-tree.ts:141) directly, because its only caller - the org scan
// in repo-grade-tree-scan.ts - keeps just a flat `string[]` of paths (see
// `OrgRepoTreeFetchers.fetchTreePaths`, repo-grade-tree-scan.ts:155), not
// typed `RepoTreeEntry[]`. It matches repo-folder-tree.ts's own exclusion
// conventions exactly rather than inventing new ones: a directory segment is
// excluded, AT EVERY DEPTH, when it is in `ignore` or starts with "." - see
// repo-folder-tree.ts:78-97's `isIgnoredSegment`/`pathIsIgnored`, which this
// mirrors for a path string instead of a typed entry.
//
// This module deliberately does NOT apply repo-folder-tree.ts's separate
// "wrapper" heuristic (traversing through a folder whose only files are
// README.md/.gitkeep) - that heuristic exists to find ONE "assignment
// level" per repo for pairing, a different job. Here every level from 1 to
// `maxDepth` is offered so the instructor can pick "assignments" (grade
// everything) or "assignments/module_03" (grade one module) from the same
// list - both are valid choices, per the test "still offers the wrapper
// itself, because grading everything is a valid choice".

import { DEFAULT_IGNORED_REPO_FOLDERS } from "./repo-assignment-folders";

/** Default nesting depth: covers the wrapper-plus-module shape
 * ("assignments/module_01") the owner's repo actually has, without walking
 * arbitrarily deep into a student's own project structure. */
const DEFAULT_MAX_DEPTH = 2;

/** The same natural-numeric comparator assignmentFoldersFromTree uses
 * (repo-assignment-folders.ts:58) and repo-folder-tree.ts's own
 * `compareNames` duplicates for the same reason - so "module_2" sorts
 * before "module_10" here exactly as it does in both of those. */
function compareFolderPaths(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/** True when `segment` is excluded at every depth, matching
 * repo-folder-tree.ts's `isIgnoredSegment`: a dot-directory (matched by
 * prefix) or an exact member of `ignore`. */
function isIgnoredSegment(segment: string, ignore: ReadonlySet<string>): boolean {
  return segment.startsWith(".") || ignore.has(segment);
}

/**
 * Every gradable folder path in a repo's flat recursive tree path list, from
 * depth 1 up to `maxDepth` (default 2), minus `ignore` (defaulting to
 * DEFAULT_IGNORED_REPO_FOLDERS) and any dot-directory - excluded at EVERY
 * depth, not just the top level, matching buildRepoFolderTree's own
 * conventions (repo-folder-tree.ts:78-97). A folder whose own path contains
 * an excluded ancestor segment is never offered, even when the ancestor
 * itself is below `maxDepth`'s cutoff.
 *
 * Each path's last "/"-separated component is treated as a file name (never
 * itself a folder), matching assignmentFoldersFromTree's own convention -
 * this also makes a trailing-slash directory placeholder entry (e.g.
 * "a/b/") collapse onto the same folder as a real file under it ("a/b/x")
 * rather than emitting a separate "a/b/" entry. Empty segments (from a
 * doubled "//") are dropped rather than emitted as blank folders.
 *
 * Sorted with the same natural-numeric comparator every other folder list in
 * this codebase uses, and always parent-before-child (a shorter prefix
 * naturally sorts before the longer path it prefixes).
 */
export function assignmentFolderPathsFromTree(
  paths: string[],
  ignore: ReadonlySet<string> = DEFAULT_IGNORED_REPO_FOLDERS,
  maxDepth: number = DEFAULT_MAX_DEPTH
): string[] {
  const depth = Math.max(1, maxDepth);
  const folders = new Set<string>();

  for (const path of paths) {
    // Drop the last component (the file name, possibly empty for a
    // trailing-slash directory placeholder) - only what comes before it is
    // ever a directory segment. Empty segments from a doubled "//" are
    // filtered out rather than treated as a blank directory.
    const directorySegments = path.split("/").slice(0, -1).filter((segment) => segment.length > 0);

    const prefix: string[] = [];
    for (let i = 0; i < Math.min(directorySegments.length, depth); i += 1) {
      const segment = directorySegments[i];
      if (isIgnoredSegment(segment, ignore)) break; // this and every deeper prefix are excluded
      prefix.push(segment);
      folders.add(prefix.join("/"));
    }
  }

  return Array.from(folders).sort(compareFolderPaths);
}
