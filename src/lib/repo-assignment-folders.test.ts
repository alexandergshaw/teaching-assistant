import { describe, it, expect } from "vitest";
import { assignmentFoldersFromTree, DEFAULT_IGNORED_REPO_FOLDERS } from "./repo-assignment-folders";

// Every expectation below is a frozen literal, hand-written against AC3
// items 13-14 (docs/repo-grades-view-acceptance-criteria.md), never computed
// from the implementation.

describe("assignmentFoldersFromTree", () => {
  it("returns distinct top-level directory segments only", () => {
    const paths = [
      "week-1/README.md",
      "week-1/main.py",
      "week-2/README.md",
      "week-2/src/app.py",
    ];

    expect(assignmentFoldersFromTree(paths)).toEqual(["week-1", "week-2"]);
  });

  it("excludes a blob at the repo root (no slash at all)", () => {
    const paths = ["README.md", "week-1/README.md"];

    expect(assignmentFoldersFromTree(paths)).toEqual(["week-1"]);
  });

  it("excludes ONLY root-level blobs when mixed with real folders, never a folder that has a nested file", () => {
    const paths = [".gitignore", "LICENSE", "week-1/notes.txt", "week-2/notes.txt"];

    expect(assignmentFoldersFromTree(paths)).toEqual(["week-1", "week-2"]);
  });

  it("applies the default ignore set (node_modules, docs, assets, img, images)", () => {
    const paths = [
      "week-1/README.md",
      "node_modules/pkg/index.js",
      "docs/notes.md",
      "assets/logo.png",
      "img/photo.png",
      "images/photo.png",
      "week-2/README.md",
    ];

    expect(assignmentFoldersFromTree(paths)).toEqual(["week-1", "week-2"]);
  });

  it("excludes dot-directories by PREFIX, not by an enumerated list", () => {
    const paths = [
      ".github/workflows/ci.yml",
      ".vscode/settings.json",
      ".anything-not-explicitly-listed/file.txt",
      "week-1/README.md",
    ];

    expect(assignmentFoldersFromTree(paths)).toEqual(["week-1"]);
  });

  it("does not enumerate .github/.vscode literally in the default ignore set (prefix rule covers them)", () => {
    expect(DEFAULT_IGNORED_REPO_FOLDERS.has(".github")).toBe(false);
    expect(DEFAULT_IGNORED_REPO_FOLDERS.has(".vscode")).toBe(false);
    expect(DEFAULT_IGNORED_REPO_FOLDERS.has("node_modules")).toBe(true);
    expect(DEFAULT_IGNORED_REPO_FOLDERS.has("docs")).toBe(true);
    expect(DEFAULT_IGNORED_REPO_FOLDERS.has("assets")).toBe(true);
    expect(DEFAULT_IGNORED_REPO_FOLDERS.has("img")).toBe(true);
    expect(DEFAULT_IGNORED_REPO_FOLDERS.has("images")).toBe(true);
  });

  it("accepts a custom ignore set that overrides the default entirely", () => {
    const paths = ["node_modules/pkg/index.js", "week-1/README.md", "custom-ignored/file.txt"];

    expect(assignmentFoldersFromTree(paths, new Set(["custom-ignored"]))).toEqual([
      "node_modules",
      "week-1",
    ]);
  });

  it("sorts with natural numeric ordering: week-2 before week-10 before week-100 (matches listAssignmentFolders)", () => {
    const paths = [
      "week-100/README.md",
      "week-2/README.md",
      "week-10/README.md",
      "week-1/README.md",
    ];

    expect(assignmentFoldersFromTree(paths)).toEqual(["week-1", "week-2", "week-10", "week-100"]);
  });

  it("returns an empty list for an empty tree", () => {
    expect(assignmentFoldersFromTree([])).toEqual([]);
  });

  it("returns an empty list when every path is a root-level blob", () => {
    expect(assignmentFoldersFromTree(["README.md", "LICENSE", ".gitignore"])).toEqual([]);
  });
});

// --------------------------------------------------------------------------
// SABOTAGE-CHECK LOG (each verified by hand: broke the behavior, ran
// `npx vitest run src/lib/repo-assignment-folders.test.ts`, confirmed a
// failure, then reverted before re-running to confirm green again).
//
// 1. Root-blob exclusion: changed `if (slashIndex === -1) continue;` to
//    `if (slashIndex === -1) folders.add(path);` in
//    repo-assignment-folders.ts. Result: "excludes a blob at the repo root"
//    failed - the result included "README.md" where the frozen expectation
//    is just ["week-1"]. Reverted; suite green again.
// 2. Natural ordering: changed the sort comparator's options from
//    `{ numeric: true, sensitivity: "base" }` to `{}` (plain lexical sort).
//    Result: "sorts with natural numeric ordering" failed - "week-10" and
//    "week-100" sorted before "week-2" lexically, not matching the frozen
//    ["week-1", "week-2", "week-10", "week-100"]. Reverted; suite green
//    again.
// 3. Dot-directory prefix rule: removed the `if (top.startsWith("."))
//    continue;` line entirely. Result: "excludes dot-directories by PREFIX"
//    failed - ".github", ".vscode", and the arbitrary
//    ".anything-not-explicitly-listed" all leaked into the result.
//    Reverted; suite green again.
// --------------------------------------------------------------------------
