// Tests for repo-module-pairing.ts
// (docs/durable-repo-module-associations-acceptance-criteria.md): the
// coercer for course_hub.repo_module_pairing, and the pure AC3 activation
// helper useRepoPairing.ts calls on every render instead of re-implementing
// the "which stored associations are real right now" question inline.
import { describe, expect, it } from "vitest";
import {
  coerceRepoModulePairing,
  emptyRepoModulePairing,
  activateRepoModulePairing,
  upsertRepoModuleAssociation,
  type RepoModuleAssociation,
} from "./repo-module-pairing";
import type { RepoModuleMappingModule } from "@/lib/repo-module-mapping";

const MODULES: RepoModuleMappingModule[] = [
  { id: 10, name: "Module 01: Setup" },
  { id: 11, name: "Module 02: Loops" },
];

describe("coerceRepoModulePairing - absence and malformed input degrade to the empty pairing", () => {
  it("undefined (AC10 - the column has not migrated yet) reads as unpaired", () => {
    expect(coerceRepoModulePairing(undefined)).toEqual(emptyRepoModulePairing());
  });

  it("null reads as unpaired", () => {
    expect(coerceRepoModulePairing(null)).toEqual(emptyRepoModulePairing());
  });

  it("a non-object (a stray string) reads as unpaired rather than throwing", () => {
    expect(() => coerceRepoModulePairing("not an object")).not.toThrow();
    expect(coerceRepoModulePairing("not an object")).toEqual(emptyRepoModulePairing());
  });

  it("an array reads as unpaired rather than throwing", () => {
    expect(coerceRepoModulePairing([1, 2, 3])).toEqual(emptyRepoModulePairing());
  });

  it("an unknown format version (not 1) is refused rather than guessed at", () => {
    expect(
      coerceRepoModulePairing({
        v: 2,
        repoRef: "org/repo",
        branch: "main",
        associations: [{ path: "assignments/module_01", kind: "folder", moduleId: "10", boundAt: "" }],
      })
    ).toEqual(emptyRepoModulePairing());
  });

  it("a missing v is refused the same way a wrong one is", () => {
    expect(coerceRepoModulePairing({ repoRef: "org/repo", branch: "main", associations: [] })).toEqual(
      emptyRepoModulePairing()
    );
  });
});

describe("coerceRepoModulePairing - structural validity of a real value", () => {
  it("round-trips a valid pairing untouched", () => {
    const raw = {
      v: 1,
      repoRef: "org/repo",
      branch: "main",
      associations: [{ path: "assignments/module_01", kind: "folder", moduleId: "10", boundAt: "2026-01-01T00:00:00Z" }],
    };
    expect(coerceRepoModulePairing(raw)).toEqual(raw);
  });

  it("drops a malformed association (missing path) rather than fabricating one", () => {
    const raw = {
      v: 1,
      repoRef: "org/repo",
      branch: "main",
      associations: [{ kind: "folder", moduleId: "10", boundAt: "" }],
    };
    expect(coerceRepoModulePairing(raw).associations).toEqual([]);
  });

  it("drops an association whose kind is neither folder nor file", () => {
    const raw = {
      v: 1,
      repoRef: "org/repo",
      branch: "main",
      associations: [{ path: "assignments/module_01", kind: "week", moduleId: "10", boundAt: "" }],
    };
    expect(coerceRepoModulePairing(raw).associations).toEqual([]);
  });

  it("drops an association with a blank moduleId", () => {
    const raw = {
      v: 1,
      repoRef: "org/repo",
      branch: "main",
      associations: [{ path: "assignments/module_01", kind: "folder", moduleId: "", boundAt: "" }],
    };
    expect(coerceRepoModulePairing(raw).associations).toEqual([]);
  });

  it("accepts a numeric moduleId, stringifying it the same way RepoModuleOverrideMap already does", () => {
    const raw = {
      v: 1,
      repoRef: "org/repo",
      branch: "main",
      associations: [{ path: "assignments/module_01", kind: "folder", moduleId: 10, boundAt: "" }],
    };
    expect(coerceRepoModulePairing(raw).associations).toEqual([
      { path: "assignments/module_01", kind: "folder", moduleId: "10", boundAt: "" },
    ]);
  });

  it("A FILE AND A FOLDER ASSOCIATION COEXIST ON THE SAME PATH STRING - the whole reason the shape is one tagged array, not two path-keyed maps", () => {
    const raw = {
      v: 1,
      repoRef: "org/repo",
      branch: "main",
      associations: [
        { path: "assignments/module_08", kind: "folder", moduleId: "10", boundAt: "" },
        { path: "assignments/module_08", kind: "file", moduleId: "11", boundAt: "" },
      ],
    };
    const coerced = coerceRepoModulePairing(raw);
    expect(coerced.associations).toHaveLength(2);
    expect(coerced.associations).toContainEqual({ path: "assignments/module_08", kind: "folder", moduleId: "10", boundAt: "" });
    expect(coerced.associations).toContainEqual({ path: "assignments/module_08", kind: "file", moduleId: "11", boundAt: "" });
  });

  it("collapses a true duplicate (same kind AND path) to its last occurrence", () => {
    const raw = {
      v: 1,
      repoRef: "org/repo",
      branch: "main",
      associations: [
        { path: "assignments/module_08", kind: "folder", moduleId: "10", boundAt: "first" },
        { path: "assignments/module_08", kind: "folder", moduleId: "11", boundAt: "second" },
      ],
    };
    expect(coerceRepoModulePairing(raw).associations).toEqual([
      { path: "assignments/module_08", kind: "folder", moduleId: "11", boundAt: "second" },
    ]);
  });

  it("caps the association list rather than growing it unboundedly", () => {
    const associations = Array.from({ length: 1500 }, (_, i) => ({
      path: `assignments/module_${i}`,
      kind: "folder",
      moduleId: "10",
      boundAt: "",
    }));
    const coerced = coerceRepoModulePairing({ v: 1, repoRef: "org/repo", branch: "main", associations });
    expect(coerced.associations.length).toBeLessThanOrEqual(1000);
  });
});

const assoc = (path: string, kind: "folder" | "file", moduleId: string): RepoModuleAssociation => ({
  path,
  kind,
  moduleId,
  boundAt: "2026-01-01T00:00:00Z",
});

describe("activateRepoModulePairing - AC3: a stale association is preserved and marked inactive, never dropped", () => {
  it("GUARD (b): a branch switch that empties the folder list preserves every stored association and marks it inactive, rather than dropping it", () => {
    const stored = [assoc("assignments/module_01", "folder", "10"), assoc("assignments/module_02", "folder", "11")];

    // Simulates the exact AC5 hazard: the tree is mid-reload, so the
    // currently-known folder list is empty - NOT because the instructor
    // removed anything, but because a new branch's tree has not finished
    // loading yet.
    const result = activateRepoModulePairing(stored, [], [], MODULES);

    // Nothing became active (correctly - nothing validates against an empty
    // folder list)...
    expect(result.folderOverrides).toEqual({});
    // ...but BOTH stored associations are still right there, reported as
    // inactive, not vanished. This is what "preserved" actually means: the
    // exact same two objects come back out.
    expect(result.inactive).toHaveLength(2);
    expect(result.inactive).toEqual(stored);
  });

  it("a folder that IS present, with a module that still exists, is active", () => {
    const stored = [assoc("assignments/module_01", "folder", "10")];
    const result = activateRepoModulePairing(stored, ["assignments/module_01"], [], MODULES);
    expect(result.folderOverrides).toEqual({ "assignments/module_01": "10" });
    expect(result.inactive).toEqual([]);
  });

  it("switching BACK to the original branch reactivates the preserved association with no re-entry needed", () => {
    const stored = [assoc("assignments/module_01", "folder", "10")];
    const midSwitch = activateRepoModulePairing(stored, [], [], MODULES);
    expect(midSwitch.folderOverrides).toEqual({});

    const backAgain = activateRepoModulePairing(stored, ["assignments/module_01"], [], MODULES);
    expect(backAgain.folderOverrides).toEqual({ "assignments/module_01": "10" });
    expect(backAgain.inactive).toEqual([]);
  });

  it("an association naming a module that no longer exists is inactive too, without being dropped from the input", () => {
    const stored = [assoc("assignments/module_01", "folder", "999")];
    const result = activateRepoModulePairing(stored, ["assignments/module_01"], [], MODULES);
    expect(result.folderOverrides).toEqual({});
    expect(result.inactive).toEqual(stored);
  });

  it("folder and file namespaces are independent - an active file does not require its folder to also be active", () => {
    const stored = [assoc("assignments/module_01", "file", "10")];
    const result = activateRepoModulePairing(stored, [], ["assignments/module_01"], MODULES);
    expect(result.fileOverrides).toEqual({ "assignments/module_01": "10" });
    expect(result.folderOverrides).toEqual({});
    expect(result.inactive).toEqual([]);
  });

  it("empty associations produce empty everything, not an error", () => {
    const result = activateRepoModulePairing([], ["assignments/module_01"], [], MODULES);
    expect(result.folderOverrides).toEqual({});
    expect(result.fileOverrides).toEqual({});
    expect(result.inactive).toEqual([]);
  });
});

describe("upsertRepoModuleAssociation - AC3's one explicit-delete path", () => {
  it("adds a new association", () => {
    const next = upsertRepoModuleAssociation([], "assignments/module_01", "folder", "10", "2026-01-01T00:00:00Z");
    expect(next).toEqual([assoc("assignments/module_01", "folder", "10")]);
  });

  it("replaces an existing association for the same kind+path, refreshing boundAt", () => {
    const before = [assoc("assignments/module_01", "folder", "10")];
    const next = upsertRepoModuleAssociation(before, "assignments/module_01", "folder", "11", "later");
    expect(next).toEqual([{ path: "assignments/module_01", kind: "folder", moduleId: "11", boundAt: "later" }]);
  });

  it("moduleId: null removes exactly that association (the explicit 'Auto' action) and no other", () => {
    const before = [assoc("assignments/module_01", "folder", "10"), assoc("assignments/module_02", "folder", "11")];
    const next = upsertRepoModuleAssociation(before, "assignments/module_01", "folder", null, "");
    expect(next).toEqual([assoc("assignments/module_02", "folder", "11")]);
  });

  it("a folder and a file association at the same path do not clobber each other", () => {
    const before = [assoc("assignments/module_08", "folder", "10")];
    const next = upsertRepoModuleAssociation(before, "assignments/module_08", "file", "11", "2026-01-01T00:00:00Z");
    expect(next).toEqual([assoc("assignments/module_08", "folder", "10"), assoc("assignments/module_08", "file", "11")]);
  });

  it("does not mutate the array it was given", () => {
    const before = [assoc("assignments/module_01", "folder", "10")];
    const beforeCopy = [...before];
    upsertRepoModuleAssociation(before, "assignments/module_01", "folder", "11", "");
    expect(before).toEqual(beforeCopy);
  });

  it("leaves every OTHER association - including an already-inactive one - untouched, rather than rebuilding from the active view", () => {
    // This is the structural guarantee behind AC3/AC5: an edit to ONE
    // currently-visible association must never discard some OTHER
    // association that happens to be inactive right now (e.g. bound on a
    // different branch) - upsertRepoModuleAssociation only ever touches the
    // one (kind, path) key it was called with.
    const before = [assoc("assignments/module_99", "folder", "999"), assoc("assignments/module_01", "folder", "10")];
    const next = upsertRepoModuleAssociation(before, "assignments/module_01", "folder", "11", "later");
    expect(next).toContainEqual(assoc("assignments/module_99", "folder", "999"));
  });
});
