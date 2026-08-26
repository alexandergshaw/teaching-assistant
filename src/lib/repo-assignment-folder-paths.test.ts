// TDD for the owner's report of 2026-08-26: "the assignment folder to grade
// selector should allow me to select a subfolder within the assignments
// folder."
//
// WRITTEN BEFORE THE IMPLEMENTATION - ./repo-assignment-folder-paths does not
// exist yet. Make it pass without changing what it asserts; if an assertion is
// wrong, report it rather than editing it.
//
// THE DEFECT, and why it explains far more than a missing dropdown option.
//
// `assignmentFoldersFromTree` (repo-assignment-folders.ts:38-59) does
// `path.slice(0, path.indexOf("/"))` - the FIRST SEGMENT ONLY. The owner
// supplied a real student repo whose structure is:
//
//     assignments/module_01 ... assignments/module_16
//     tests/
//     .github/workflows/
//
// So the only folder this app could ever offer was `assignments`, and every
// grade in their exported log recorded `"folder": "assignments"`. All eleven
// students had ALL SIXTEEN MODULES graded together as a single submission,
// against one README, in one model call.
//
// That is very likely the real source of the "inconsistent totals" they
// reported separately: asked to score sixteen modules at once with no shared
// rubric, the grader invented a different scale each time - 100, 400, 40, 16.
// Note also github.digest.ts:148, which raises the ingest budget when a
// pathPrefix names a folder, precisely because "that folder IS the grading
// scope, not a sample of it"; grading the whole `assignments` tree instead
// runs under the whole-repo caps and can be silently truncated.
//
// THE GRADING PATH ALREADY SUPPORTS NESTED FOLDERS. `ingestRepo`'s
// `pathPrefix` is "a plain string.startsWith filter" (github.digest.ts:75, as
// documented at github-grading-folder.ts:29-32), and
// `pickReadmeInstructions` already measures README depth RELATIVE to
// `pathPrefix`. So "assignments/module_03" works end to end today. Only
// DISCOVERY is top-level-only. This module fixes discovery.
//
// REUSE NOTE: `buildRepoFolderTree` (repo-folder-tree.ts:141) already walks a
// full nested tree and already excludes ignored and dot directories at EVERY
// depth. It consumes typed `RepoTreeEntry[]` though, while the org scan keeps
// only a flat path list - which is why this module is path-based. It must
// match repo-folder-tree.ts's conventions exactly, not invent its own.
import { describe, expect, it } from "vitest";
import { DEFAULT_IGNORED_REPO_FOLDERS } from "./repo-assignment-folders";
import { assignmentFolderPathsFromTree } from "./repo-assignment-folder-paths";

/** The owner's actual repo, reduced to its shape. */
const REAL_REPO_PATHS = [
  "README.md",
  ".github/workflows/classroom.yml",
  "assignments/module_01/main.py",
  "assignments/module_01/README.md",
  "assignments/module_02/main.py",
  "assignments/module_03/main.py",
  "assignments/module_10/main.py",
  "tests/test_module_01.py",
];

describe("assignmentFolderPathsFromTree - the owner's real repo", () => {
  it("offers each module as its own gradable folder, not just the assignments wrapper", () => {
    const folders = assignmentFolderPathsFromTree(REAL_REPO_PATHS);
    expect(folders).toContain("assignments/module_01");
    expect(folders).toContain("assignments/module_03");
    expect(folders).toContain("assignments/module_10");
  });

  it("still offers the wrapper itself, because grading everything is a valid choice", () => {
    expect(assignmentFolderPathsFromTree(REAL_REPO_PATHS)).toContain("assignments");
  });

  it("does not offer a file as if it were a folder", () => {
    const folders = assignmentFolderPathsFromTree(REAL_REPO_PATHS);
    expect(folders).not.toContain("README.md");
    expect(folders).not.toContain("assignments/module_01/main.py");
  });

  it("excludes dot-directories at every depth, not only the top level", () => {
    const folders = assignmentFolderPathsFromTree(REAL_REPO_PATHS);
    expect(folders).not.toContain(".github");
    expect(folders).not.toContain(".github/workflows");
  });

  it("sorts naturally, so module_2 precedes module_10", () => {
    const folders = assignmentFolderPathsFromTree([
      "assignments/module_10/a.py",
      "assignments/module_2/a.py",
      "assignments/module_1/a.py",
    ]);
    expect(folders).toEqual(["assignments", "assignments/module_1", "assignments/module_2", "assignments/module_10"]);
  });

  it("lists a parent before its own children", () => {
    const folders = assignmentFolderPathsFromTree(REAL_REPO_PATHS);
    expect(folders.indexOf("assignments")).toBeLessThan(folders.indexOf("assignments/module_01"));
  });
});

describe("assignmentFolderPathsFromTree - exclusion rules match the existing conventions", () => {
  it("excludes an ignored folder at the top level", () => {
    expect(assignmentFolderPathsFromTree(["node_modules/pkg/index.js", "src/a.ts"])).toEqual(["src"]);
  });

  it("excludes an ignored folder nested deep, which the flat version could never do", () => {
    // repo-folder-tree.ts:82-83 states this rule explicitly: "a node_modules
    // folder three levels deep is excluded exactly as a top-level one would be".
    const folders = assignmentFolderPathsFromTree(["assignments/module_01/node_modules/pkg/index.js"]);
    expect(folders).not.toContain("assignments/module_01/node_modules");
  });

  it("keeps a folder whose ancestor merely resembles an ignored name", () => {
    const folders = assignmentFolderPathsFromTree(["assignments/documentation/a.md"]);
    expect(folders).toContain("assignments/documentation");
  });

  it("honours a caller-supplied ignore set instead of the default", () => {
    const folders = assignmentFolderPathsFromTree(["skipme/a.txt", "keep/b.txt"], new Set(["skipme"]));
    expect(folders).toEqual(["keep"]);
  });

  it("does not exclude a dot-FILE, only a dot-DIRECTORY", () => {
    // repo-folder-tree.ts:88-92 draws this distinction deliberately.
    const folders = assignmentFolderPathsFromTree(["assignments/module_01/.env"]);
    expect(folders).toContain("assignments/module_01");
  });

  it("uses the same default ignore set as the flat version", () => {
    for (const ignored of DEFAULT_IGNORED_REPO_FOLDERS) {
      expect(assignmentFolderPathsFromTree([`${ignored}/a.txt`])).toEqual([]);
    }
  });
});

describe("assignmentFolderPathsFromTree - depth", () => {
  const DEEP = ["a/b/c/d/file.txt"];

  it("defaults to two levels, which covers the wrapper-plus-module shape", () => {
    expect(assignmentFolderPathsFromTree(DEEP)).toEqual(["a", "a/b"]);
  });

  it("honours a deeper explicit limit", () => {
    expect(assignmentFolderPathsFromTree(DEEP, DEFAULT_IGNORED_REPO_FOLDERS, 3)).toEqual(["a", "a/b", "a/b/c"]);
  });

  it("can be limited to one level, reproducing the flat behaviour", () => {
    expect(assignmentFolderPathsFromTree(DEEP, DEFAULT_IGNORED_REPO_FOLDERS, 1)).toEqual(["a"]);
  });

  it("never emits the file's own directory when that would exceed the limit", () => {
    expect(assignmentFolderPathsFromTree(DEEP, DEFAULT_IGNORED_REPO_FOLDERS, 2)).not.toContain("a/b/c");
  });

  it("treats a depth below one as one rather than returning nothing", () => {
    expect(assignmentFolderPathsFromTree(DEEP, DEFAULT_IGNORED_REPO_FOLDERS, 0)).toEqual(["a"]);
  });
});

describe("assignmentFolderPathsFromTree - degenerate input", () => {
  it("returns nothing for an empty tree", () => {
    expect(assignmentFolderPathsFromTree([])).toEqual([]);
  });

  it("returns nothing for a repo of only root-level files", () => {
    expect(assignmentFolderPathsFromTree(["README.md", "LICENSE", ".gitignore"])).toEqual([]);
  });

  it("dedupes a folder named by many files", () => {
    const folders = assignmentFolderPathsFromTree(["a/1.txt", "a/2.txt", "a/3.txt"]);
    expect(folders).toEqual(["a"]);
  });

  it("ignores empty segments from a doubled slash rather than emitting a blank folder", () => {
    const folders = assignmentFolderPathsFromTree(["a//b/file.txt"]);
    expect(folders).not.toContain("");
    expect(folders.every((f) => f.trim().length > 0)).toBe(true);
  });

  it("does not emit a trailing-slash directory as its own separate entry", () => {
    const folders = assignmentFolderPathsFromTree(["a/b/file.txt", "a/b/"]);
    expect(folders.filter((f) => f === "a/b")).toHaveLength(1);
    expect(folders).not.toContain("a/b/");
  });
});
