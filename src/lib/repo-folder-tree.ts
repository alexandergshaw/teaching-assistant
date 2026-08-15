// Repo pairing in modules - AC2 (docs/repo-pairing-in-modules-acceptance-criteria.md):
// turns a repo's FLAT recursive `RepoTreeEntry[]` (getRepoTree,
// src/lib/github.files.ts:17 - which, unlike every other consumer in this
// repo, keeps `type: "blob" | "tree"` on every entry instead of discarding
// it) into a NESTED folder view-model. Nothing else here builds one:
// `assignmentFoldersFromTree` (src/lib/repo-assignment-folders.ts:38) walks
// the same flat list but only ever surfaces distinct TOP-LEVEL segments,
// because that is all AC3 of the Repo Grades view needed. This feature needs
// more, because the measured shape needs more.
//
// WHY NESTED MATTERS - measured against the instructor's real repo
// (`python-java-c-main`, see the AC doc's "What the real data says"): every
// assignment folder sits at DEPTH TWO, as `assignments/module_01/` through
// `assignments/module_16/`. A top-level-only walk finds exactly one folder,
// `assignments`, and is useless for pairing anything to a module. This
// module builds the full nested tree, then separately answers "which depth
// are the interesting folders actually at" - see findAssignmentFolderLevel
// below - rather than assuming depth 0 (too shallow here) or hard-coding the
// literal name "assignments" (works for this one repo, not the next one).
//
// THE HEURISTIC, stated and defended:
//   A folder is a WRAPPER - traversed THROUGH rather than treated as an
//   assignment folder in its own right - when it holds at least one
//   subfolder AND every direct file it holds (if any) is boilerplate.
//   "Boilerplate" here means literally README.md or .gitkeep
//   (case-insensitive), because those are the two file names this repo's own
//   scaffold generator stamps into every directory it creates (measured: 36
//   leaf files total, 18 README.md + 18 .gitkeep, nothing else) - they carry
//   no assignment-specific content of their own, only structure and
//   boilerplate prose. `assignments/` holds 16 subfolders PLUS a README: it
//   is a wrapper, and is traversed through so its 16 children surface
//   instead of it. Each `module_NN/` holds ONLY a README and a .gitkeep and
//   NO subfolders: the "has at least one subfolder" half of the test fails,
//   so it is never a wrapper candidate no matter what its files are - it
//   surfaces as an assignment folder in its own right, exactly as it must
//   (point 4 below: a folder with no source files is NORMAL here, not
//   empty/invalid). The two rules compose correctly without either one
//   alone being enough: "no meaningful files" by itself would also swallow
//   `module_NN/` (it has no meaningful files either); "has subfolders" by
//   itself would also swallow a genuine assignment folder that happens to
//   organize its own solution into `src/`/`tests/` subfolders. Requiring
//   BOTH is what tells `assignments/` (pure scaffolding, traverse through)
//   apart from `module_NN/` (the leaf, stop here) using only the shape of
//   the data - no folder name is ever hard-coded.
//
// This module is PURE - no React, no network, no Supabase, just
// `RepoTreeEntry[]` in and a tree out - so it is fully node-testable. See
// repo-folder-tree.test.ts's own header for the vitest environment note.

import type { RepoTreeEntry } from "./github.files";
import { DEFAULT_IGNORED_REPO_FOLDERS } from "./repo-assignment-folders";

/** One file directly inside a RepoFolderNode. */
export interface RepoFolderFile {
  /** Full path from the repo root, e.g. "assignments/module_01/README.md". */
  path: string;
  /** Just this file's own name, e.g. "README.md". */
  name: string;
  size: number;
  sha: string;
}

/** One folder in the nested view-model. The synthetic root returned by
 * buildRepoFolderTree has `path: ""` and `name: ""` and is never itself a
 * "real" folder - every folder that exists in the repo is somewhere under
 * `root.folders`. */
export interface RepoFolderNode {
  /** Full path from the repo root, e.g. "assignments/module_01". Empty
   * string only for the synthetic root. */
  path: string;
  /** Just this folder's own name, e.g. "module_01". Empty string only for
   * the synthetic root. */
  name: string;
  folders: RepoFolderNode[];
  files: RepoFolderFile[];
}

/** A directory segment is excluded the same way
 * assignmentFoldersFromTree (src/lib/repo-assignment-folders.ts:38) already
 * excludes it: by exact membership in `ignore`, or by a leading "." (every
 * dot-directory, matched by prefix rather than enumerated). This is checked
 * at EVERY depth here, not just at the top level - a `node_modules` folder
 * three levels deep is excluded exactly as a top-level one would be. */
function isIgnoredSegment(segment: string, ignore: ReadonlySet<string>): boolean {
  return segment.startsWith(".") || ignore.has(segment);
}

/** True when `path` sits under (or, for a tree entry, ends in) an ignored
 * directory segment anywhere along it. For a blob, only the segments BEFORE
 * the file name are directory segments - a dot-FILE like ".env" must not be
 * excluded by the dot-directory rule, only a dot-DIRECTORY. For a tree
 * entry, every segment including the last is itself a directory. */
function pathIsIgnored(path: string, type: RepoTreeEntry["type"], ignore: ReadonlySet<string>): boolean {
  const segments = path.split("/");
  const directorySegments = type === "blob" ? segments.slice(0, -1) : segments;
  return directorySegments.some((segment) => isIgnoredSegment(segment, ignore));
}

/** Returns the existing node at `path`, or creates it (and, recursively,
 * every missing ancestor up to root) and links it into its parent's
 * `folders`. Safe to call in any order relative to other entries - a folder
 * is created on first reference whether that reference is its own `tree`
 * entry or a descendant blob/tree naming it as an ancestor. */
function ensureFolder(map: Map<string, RepoFolderNode>, root: RepoFolderNode, path: string): RepoFolderNode {
  const existing = map.get(path);
  if (existing) return existing;

  const lastSlash = path.lastIndexOf("/");
  const name = lastSlash === -1 ? path : path.slice(lastSlash + 1);
  const parentPath = lastSlash === -1 ? "" : path.slice(0, lastSlash);

  const node: RepoFolderNode = { path, name, folders: [], files: [] };
  map.set(path, node);

  const parent = parentPath === "" ? root : ensureFolder(map, root, parentPath);
  parent.folders.push(node);
  return node;
}

/** The same natural-numeric comparator assignmentFoldersFromTree uses
 * (src/lib/repo-assignment-folders.ts:58), reused verbatim so "module_2"
 * sorts before "module_10" here exactly as it does there. */
function compareNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function sortTree(node: RepoFolderNode): void {
  node.folders.sort((a, b) => compareNames(a.name, b.name));
  node.files.sort((a, b) => compareNames(a.name, b.name));
  for (const folder of node.folders) sortTree(folder);
}

/**
 * Builds the nested folder tree from a repo's flat recursive entry list.
 * Ignored folders (`ignore`, defaulting to DEFAULT_IGNORED_REPO_FOLDERS) and
 * dot-directories are dropped at every depth, matching
 * assignmentFoldersFromTree's existing conventions. Every folder's `folders`
 * and `files` are sorted with the same natural-numeric comparator that
 * module already uses.
 */
export function buildRepoFolderTree(
  entries: readonly RepoTreeEntry[],
  ignore: ReadonlySet<string> = DEFAULT_IGNORED_REPO_FOLDERS
): RepoFolderNode {
  const root: RepoFolderNode = { path: "", name: "", folders: [], files: [] };
  const map = new Map<string, RepoFolderNode>();

  for (const entry of entries) {
    if (!entry.path) continue;
    if (pathIsIgnored(entry.path, entry.type, ignore)) continue;

    if (entry.type === "tree") {
      ensureFolder(map, root, entry.path);
      continue;
    }

    // entry.type === "blob" - RepoTreeEntry.type is exhaustively "blob" | "tree".
    const lastSlash = entry.path.lastIndexOf("/");
    const name = lastSlash === -1 ? entry.path : entry.path.slice(lastSlash + 1);
    const parentPath = lastSlash === -1 ? "" : entry.path.slice(0, lastSlash);
    const parent = parentPath === "" ? root : ensureFolder(map, root, parentPath);
    parent.files.push({ path: entry.path, name, size: entry.size, sha: entry.sha });
  }

  sortTree(root);
  return root;
}

/** README.md and .gitkeep (case-insensitive) - see the module header for why
 * these two names, and only these two, count as boilerplate rather than
 * "meaningful" content for the wrapper heuristic. */
const BOILERPLATE_FILE_NAMES: ReadonlySet<string> = new Set(["readme.md", ".gitkeep"]);

function isBoilerplateFile(file: RepoFolderFile): boolean {
  return BOILERPLATE_FILE_NAMES.has(file.name.toLowerCase());
}

/** A folder is a WRAPPER - see the module header's defended heuristic - when
 * it has at least one subfolder AND every direct file it holds (zero files
 * counts) is boilerplate. */
function isWrapperFolder(node: RepoFolderNode): boolean {
  return node.folders.length > 0 && node.files.every(isBoilerplateFile);
}

/** Resolves one folder to the assignment-level folder(s) it represents:
 * itself, unless it is a wrapper, in which case its children are resolved
 * the same way (so a chain of nested pure-wrapper folders is traversed all
 * the way through, not just one level). */
function resolveThroughWrappers(node: RepoFolderNode): RepoFolderNode[] {
  if (isWrapperFolder(node)) return node.folders.flatMap(resolveThroughWrappers);
  return [node];
}

/**
 * Finds the "assignment folder level" - the set of folders that are the
 * actual interesting units, per the wrapper heuristic defended in the module
 * header - rather than assuming depth 0 or hard-coding a folder name. The
 * synthetic root itself is never a candidate (it represents the whole repo,
 * not a folder); its own direct files, if any, are irrelevant to this
 * decision. Returns an empty array when the tree has no folders at all (an
 * empty tree, or a tree with only root-level blobs) - the caller states that
 * as "no pairing found" (AC10), never as an empty successful pairing.
 */
export function findAssignmentFolderLevel(root: RepoFolderNode): RepoFolderNode[] {
  return root.folders.flatMap(resolveThroughWrappers);
}
