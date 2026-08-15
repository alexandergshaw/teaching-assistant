// Repo pairing in modules - AC2 (docs/repo-pairing-in-modules-acceptance-criteria.md).
// See repo-folder-tree.ts's own header for the wrapper heuristic this file
// exercises. vitest here is node-env and collects only src/**/*.test.ts, so
// no component is ever rendered - this file only ever constructs plain
// RepoTreeEntry[] fixtures and reads the plain object tree the module hands
// back. Every expectation below is a frozen literal, hand-written against
// the AC doc's measured shape, never computed from the implementation.

import { describe, it, expect } from "vitest";
import { buildRepoFolderTree, findAssignmentFolderLevel, type RepoFolderNode } from "./repo-folder-tree";
import type { RepoTreeEntry } from "./github.files";

function blob(path: string, size = 0): RepoTreeEntry {
  return { path, type: "blob", size, sha: `sha:${path}` };
}

function tree(path: string): RepoTreeEntry {
  return { path, type: "tree", size: 0, sha: `sha:${path}` };
}

/** Names only, for compact assertions against a list of RepoFolderNode. */
function names(nodes: readonly RepoFolderNode[]): string[] {
  return nodes.map((n) => n.name);
}

describe("buildRepoFolderTree", () => {
  it("returns an empty root for an empty tree", () => {
    const root = buildRepoFolderTree([]);
    expect(root).toEqual({ path: "", name: "", folders: [], files: [] });
  });

  it("puts root-level blobs directly on the root, not as a folder", () => {
    const root = buildRepoFolderTree([blob("README.md"), blob("LICENSE")]);
    expect(root.folders).toEqual([]);
    expect(root.files.map((f) => f.name)).toEqual(["LICENSE", "README.md"]);
  });

  it("nests a folder under its parent, with its own path and name", () => {
    const root = buildRepoFolderTree([
      tree("assignments"),
      tree("assignments/module_01"),
      blob("assignments/module_01/README.md"),
    ]);

    expect(root.folders).toHaveLength(1);
    const assignments = root.folders[0];
    expect(assignments.path).toBe("assignments");
    expect(assignments.name).toBe("assignments");
    expect(assignments.folders).toHaveLength(1);

    const module01 = assignments.folders[0];
    expect(module01.path).toBe("assignments/module_01");
    expect(module01.name).toBe("module_01");
    expect(module01.files.map((f) => f.name)).toEqual(["README.md"]);
  });

  it("creates intermediate folders even when only a deep blob names them (no explicit tree entry)", () => {
    const root = buildRepoFolderTree([blob("assignments/module_01/src/app/main.py")]);

    expect(root.folders.map((f) => f.path)).toEqual(["assignments"]);
    const assignments = root.folders[0];
    expect(assignments.folders.map((f) => f.path)).toEqual(["assignments/module_01"]);
    const module01 = assignments.folders[0];
    expect(module01.folders.map((f) => f.path)).toEqual(["assignments/module_01/src"]);
    const src = module01.folders[0];
    expect(src.folders.map((f) => f.path)).toEqual(["assignments/module_01/src/app"]);
    expect(src.folders[0].files.map((f) => f.name)).toEqual(["main.py"]);
  });

  it("drops a folder with no source files down to just its README - not empty, not invalid", () => {
    const root = buildRepoFolderTree([
      tree("assignments/module_01"),
      blob("assignments/module_01/README.md"),
      blob("assignments/module_01/.gitkeep", 0),
    ]);
    const module01 = root.folders[0].folders[0];
    expect(module01.folders).toEqual([]);
    expect(module01.files.map((f) => f.name)).toEqual([".gitkeep", "README.md"]);
  });

  it("applies the default ignore set at any depth, not only at the top level", () => {
    const root = buildRepoFolderTree([
      tree("assignments/module_01"),
      blob("assignments/module_01/README.md"),
      tree("assignments/module_01/node_modules"),
      blob("assignments/module_01/node_modules/pkg/index.js"),
      tree("assignments/module_01/docs"),
      blob("assignments/module_01/docs/notes.md"),
    ]);
    const module01 = root.folders[0].folders[0];
    expect(module01.folders).toEqual([]);
    expect(module01.files.map((f) => f.name)).toEqual(["README.md"]);
  });

  it("excludes dot-directories by prefix at any depth", () => {
    const root = buildRepoFolderTree([
      tree("assignments/module_01"),
      blob("assignments/module_01/README.md"),
      tree("assignments/module_01/.vscode"),
      blob("assignments/module_01/.vscode/settings.json"),
    ]);
    const module01 = root.folders[0].folders[0];
    expect(module01.folders).toEqual([]);
  });

  it("does not exclude a dot-FILE by the dot-directory rule", () => {
    const root = buildRepoFolderTree([tree("assignments/module_01"), blob("assignments/module_01/.env")]);
    const module01 = root.folders[0].folders[0];
    expect(module01.files.map((f) => f.name)).toEqual([".env"]);
  });

  it("sorts folders and files with natural numeric ordering at every level", () => {
    const root = buildRepoFolderTree([
      tree("assignments/module_10"),
      tree("assignments/module_2"),
      tree("assignments/module_1"),
      blob("assignments/module_1/z.txt"),
      blob("assignments/module_1/a.txt"),
    ]);
    const assignments = root.folders[0];
    expect(names(assignments.folders)).toEqual(["module_1", "module_2", "module_10"]);
    expect(assignments.folders[0].files.map((f) => f.name)).toEqual(["a.txt", "z.txt"]);
  });

  it("carries size and sha through onto each file", () => {
    const root = buildRepoFolderTree([{ path: "README.md", type: "blob", size: 42, sha: "abc123" }]);
    expect(root.files[0]).toEqual({ path: "README.md", name: "README.md", size: 42, sha: "abc123" });
  });
});

describe("findAssignmentFolderLevel", () => {
  it("returns an empty array for an empty tree", () => {
    const root = buildRepoFolderTree([]);
    expect(findAssignmentFolderLevel(root)).toEqual([]);
  });

  it("returns an empty array for a tree with only blobs at root", () => {
    const root = buildRepoFolderTree([blob("README.md"), blob("LICENSE")]);
    expect(findAssignmentFolderLevel(root)).toEqual([]);
  });

  it("treats a folder containing only a README as the assignment folder itself, not empty/invalid", () => {
    const root = buildRepoFolderTree([tree("week-1"), blob("week-1/README.md")]);
    const level = findAssignmentFolderLevel(root);
    expect(names(level)).toEqual(["week-1"]);
    expect(level[0].files.map((f) => f.name)).toEqual(["README.md"]);
  });

  it("falls back to top-level folders when there is no wrapper (flat repo, matches assignmentFoldersFromTree's case)", () => {
    const root = buildRepoFolderTree([
      tree("week-1"),
      blob("week-1/main.py"),
      tree("week-2"),
      blob("week-2/main.py"),
    ]);
    expect(names(findAssignmentFolderLevel(root))).toEqual(["week-1", "week-2"]);
  });

  it("traverses THROUGH a wrapper folder (subfolders only, boilerplate files only) to its children", () => {
    const root = buildRepoFolderTree([
      tree("assignments"),
      blob("assignments/README.md"),
      tree("assignments/module_01"),
      blob("assignments/module_01/README.md"),
      tree("assignments/module_02"),
      blob("assignments/module_02/README.md"),
    ]);
    expect(names(findAssignmentFolderLevel(root))).toEqual(["module_01", "module_02"]);
  });

  it("does NOT traverse through a folder that has a non-boilerplate file alongside its subfolders", () => {
    const root = buildRepoFolderTree([
      tree("assignments"),
      blob("assignments/overview.pdf"),
      tree("assignments/module_01"),
      blob("assignments/module_01/README.md"),
    ]);
    // "assignments" holds a meaningful file of its own, so it is the
    // assignment level - its child is never surfaced past it.
    expect(names(findAssignmentFolderLevel(root))).toEqual(["assignments"]);
  });

  it("traverses through even a single-subfolder wrapper when its own files are all boilerplate (documents the rule's literal reach)", () => {
    const root = buildRepoFolderTree([
      tree("week-1"),
      blob("week-1/README.md"),
      tree("week-1/src"),
      blob("week-1/src/main.py"),
    ]);
    // week-1 satisfies the wrapper test exactly as written (module header):
    // it has a subfolder, and its own only direct file is boilerplate. The
    // rule does not special-case "exactly one subfolder" - the real repo's
    // module_NN folders never have subfolders at all (see the case below),
    // so this combination never actually occurs in the measured data; it is
    // pinned here so the rule's literal behavior is documented rather than
    // assumed.
    const level = findAssignmentFolderLevel(root);
    expect(names(level)).toEqual(["src"]);
  });

  it("handles ignored folders appearing at the assignment level itself (excluded before the level is computed)", () => {
    const root = buildRepoFolderTree([
      tree("assignments"),
      blob("assignments/README.md"),
      tree("assignments/module_01"),
      blob("assignments/module_01/README.md"),
      tree("assignments/node_modules"),
      blob("assignments/node_modules/pkg/index.js"),
    ]);
    expect(names(findAssignmentFolderLevel(root))).toEqual(["module_01"]);
  });

  it("sorts the assignment level with natural numeric ordering: module_2 before module_10", () => {
    const root = buildRepoFolderTree([
      tree("assignments"),
      blob("assignments/README.md"),
      tree("assignments/module_10"),
      blob("assignments/module_10/README.md"),
      tree("assignments/module_2"),
      blob("assignments/module_2/README.md"),
      tree("assignments/module_1"),
      blob("assignments/module_1/README.md"),
    ]);
    expect(names(findAssignmentFolderLevel(root))).toEqual(["module_1", "module_2", "module_10"]);
  });

  it("matches the real repo end to end: assignments/module_01 through module_16, each with only README.md and .gitkeep", () => {
    const entries: RepoTreeEntry[] = [tree("assignments"), blob("assignments/README.md")];
    for (let n = 1; n <= 16; n++) {
      const dir = `assignments/module_${String(n).padStart(2, "0")}`;
      entries.push(tree(dir), blob(`${dir}/README.md`), blob(`${dir}/.gitkeep`, 0));
    }

    const root = buildRepoFolderTree(entries);
    const level = findAssignmentFolderLevel(root);

    expect(names(level)).toEqual([
      "module_01",
      "module_02",
      "module_03",
      "module_04",
      "module_05",
      "module_06",
      "module_07",
      "module_08",
      "module_09",
      "module_10",
      "module_11",
      "module_12",
      "module_13",
      "module_14",
      "module_15",
      "module_16",
    ]);

    for (const folder of level) {
      expect(folder.folders).toEqual([]);
      expect(folder.files.map((f) => f.name)).toEqual([".gitkeep", "README.md"]);
    }
  });
});

// --------------------------------------------------------------------------
// SABOTAGE-CHECK LOG (verified by hand: broke the behavior, ran
// `npx vitest run src/lib/repo-folder-tree.test.ts`, confirmed a failure,
// then reverted before re-running to confirm green again).
//
// 1. Numeric sort: in repo-folder-tree.ts, changed compareNames's options
//    from `{ numeric: true, sensitivity: "base" }` to plain
//    `a.localeCompare(b)`. Result: both "sorts folders and files with
//    natural numeric ordering at every level" AND "sorts the assignment
//    level with natural numeric ordering: module_2 before module_10" failed
//    - "module_10" sorted before "module_2" lexically. The zero-padded
//    "matches the real repo end to end" test did NOT fail under this
//    sabotage - module_01..module_16 are all the same length, so plain
//    lexical and natural-numeric ordering agree on them; only the
//    deliberately UNPADDED fixtures (module_1/module_2/module_10) actually
//    exercise the numeric-vs-lexical difference, which is why both such
//    tests exist rather than relying on the padded fixture alone. Reverted;
//    all 20 tests green again.
// --------------------------------------------------------------------------
