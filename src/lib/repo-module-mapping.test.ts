// Tests for src/lib/repo-module-mapping.ts (AC3, AC4 of
// docs/repo-pairing-in-modules-acceptance-criteria.md). vitest here is
// node-env and collects only src/**/*.test.ts - no component is ever
// rendered by this suite, and this module has none to render (see its own
// header comment). Pins the FACTS (which folder pairs with which module, at
// which state) and their ORDERING (pairings follow input folder order), never
// the spelling of any label.

import { describe, expect, it } from "vitest";
import {
  applyRepoModuleOverrides,
  EMPTY_REPO_MODULE_OVERRIDES,
  filterRepoModuleOverrides,
  mapRepoFoldersToModules,
  type RepoModuleMappingModule,
  type RepoModuleOverrideMap,
} from "./repo-module-mapping";

// The real course shape, per the acceptance doc's measured data: "Start
// Here" plus Module 01 - Module 16.
function realCourseModules(): RepoModuleMappingModule[] {
  const modules: RepoModuleMappingModule[] = [{ id: "start-here", name: "Start Here" }];
  const titles: Record<number, string> = {
    1: "Course Setup and Environment",
    8: "Midterm Assessment",
    11: "Object-Oriented Programming II",
    16: "Final Assessment",
  };
  for (let n = 1; n <= 16; n++) {
    const padded = String(n).padStart(2, "0");
    const title = titles[n] ?? `Topic ${n}`;
    modules.push({ id: `m${n}`, name: `Module ${padded}: ${title}` });
  }
  return modules;
}

function realRepoFolders(): string[] {
  const folders: string[] = [];
  for (let n = 1; n <= 16; n++) {
    folders.push(`assignments/module_${String(n).padStart(2, "0")}`);
  }
  return folders;
}

describe("mapRepoFoldersToModules - the real shape end to end", () => {
  it("pairs all 16 numbered folders by number, confirmed, and leaves Start Here unmapped", () => {
    const modules = realCourseModules();
    const result = mapRepoFoldersToModules(realRepoFolders(), modules);

    expect(result.pairings).toHaveLength(16);
    for (let n = 1; n <= 16; n++) {
      const pairing = result.pairings[n - 1];
      expect(pairing.folderPath).toBe(`assignments/module_${String(n).padStart(2, "0")}`);
      expect(pairing.state).toBe("confirmed");
      expect(pairing.matchedBy).toBe("number");
      expect(pairing.module?.moduleId).toBe(`m${n}`);
    }

    expect(result.unmappedFolders).toHaveLength(0);
    expect(result.unmappedModules.map((m) => m.id)).toEqual(["start-here"]);
  });
});

describe("mapRepoFoldersToModules - the critical case: number wins over disagreeing titles", () => {
  it("pairs module_08 to Midterm Assessment even though the repo README topic is Object Modeling Assignment", () => {
    const modules: RepoModuleMappingModule[] = [
      { id: "m8", name: "Module 08: Midterm Assessment" },
      { id: "m11", name: "Module 11: Object-Oriented Programming II" },
    ];
    // The folder's own name never carries "Object Modeling Assignment" - per
    // the measured shape, that text lives only in the folder's README, which
    // this pure module never reads. Passing it in anyway (as if a caller
    // supplied a richer leaf label) proves the number rule still wins even
    // when a title-like string is right there in the path.
    const folders = ["assignments/module_08-object-modeling-assignment"];

    const result = mapRepoFoldersToModules(folders, modules);

    expect(result.pairings).toHaveLength(1);
    expect(result.pairings[0].state).toBe("confirmed");
    expect(result.pairings[0].matchedBy).toBe("number");
    expect(result.pairings[0].module).toEqual({ moduleId: "m8", moduleName: "Module 08: Midterm Assessment" });
  });

  it("does not lure module_08 toward a decoy module whose title is a near-perfect textual match", () => {
    // "Extra Module: Object Modeling Assignment" shares FOUR tokens with the
    // folder's own leaf name ("module", "object", "modeling", "assignment")
    // - strictly more overlap than the correct target ("Module 08: Midterm
    // Assessment" shares only "module" plus the numeric bonus, three points
    // total). A matcher that consulted token/title similarity at all would
    // score this decoy higher and pick it. It must not: the folder has a
    // number (8), so rule 1 applies exclusively and rule 2 (token overlap)
    // never runs for this folder at all.
    const modules: RepoModuleMappingModule[] = [
      { id: "m8", name: "Module 08: Midterm Assessment" },
      { id: "decoy", name: "Extra Module: Object Modeling Assignment" },
    ];
    const folders = ["assignments/module_08-object-modeling-assignment"];

    const result = mapRepoFoldersToModules(folders, modules);

    expect(result.pairings[0].state).toBe("confirmed");
    expect(result.pairings[0].module?.moduleId).toBe("m8");
    expect(result.pairings[0].module?.moduleId).not.toBe("decoy");
  });
});

describe("mapRepoFoldersToModules - full-number matching", () => {
  it("pairs module_07 to module 7 and module_17 to module 17, never colliding", () => {
    const modules: RepoModuleMappingModule[] = [
      { id: "m7", name: "Module 07: Loops" },
      { id: "m17", name: "Module 17: Capstone" },
    ];
    const result = mapRepoFoldersToModules(["assignments/module_07", "assignments/module_17"], modules);

    const p7 = result.pairings.find((p) => p.folderPath === "assignments/module_07");
    const p17 = result.pairings.find((p) => p.folderPath === "assignments/module_17");

    expect(p7?.state).toBe("confirmed");
    expect(p7?.module?.moduleId).toBe("m7");
    expect(p17?.state).toBe("confirmed");
    expect(p17?.module?.moduleId).toBe("m17");
  });
});

describe("mapRepoFoldersToModules - no number at all", () => {
  it("falls back to token overlap and is at most suggested, never confirmed", () => {
    const modules: RepoModuleMappingModule[] = [
      { id: "m1", name: "Loops and Iteration" },
      { id: "m2", name: "Arrays and Collections" },
    ];
    const result = mapRepoFoldersToModules(["assignments/loops-and-iteration"], modules);

    expect(result.pairings[0].matchedBy).toBe("token");
    expect(result.pairings[0].state).toBe("suggested");
    expect(result.pairings[0].state).not.toBe("confirmed");
    expect(result.pairings[0].module?.moduleId).toBe("m1");
  });

  it("is unbound when no module shares any token with the folder", () => {
    const modules: RepoModuleMappingModule[] = [{ id: "m1", name: "Loops and Iteration" }];
    const result = mapRepoFoldersToModules(["assignments/xyzzy-plugh"], modules);

    expect(result.pairings[0].state).toBe("unbound");
    expect(result.pairings[0].matchedBy).toBe("token");
    expect(result.pairings[0].module).toBeNull();
    expect(result.pairings[0].candidates).toEqual([]);
    expect(result.unmappedFolders).toHaveLength(1);
  });
});

describe("mapRepoFoldersToModules - a numbered folder that matches no module", () => {
  it("is unbound, and does not fall back to token matching (repo module_17 pairs with nothing)", () => {
    // Only modules 1-16 exist; module_17 has no module to pair with, and per
    // rule 3 it must not fall back to a title guess just because it has one.
    const modules: RepoModuleMappingModule[] = [{ id: "m1", name: "Module 01: Intro" }];
    const result = mapRepoFoldersToModules(["assignments/module_17"], modules);

    expect(result.pairings[0].state).toBe("unbound");
    expect(result.pairings[0].matchedBy).toBe("number");
    expect(result.pairings[0].module).toBeNull();
  });
});

describe("mapRepoFoldersToModules - ambiguity, surfaced not resolved", () => {
  it("marks two folders claiming the same module number ambiguous, and reports both", () => {
    const modules: RepoModuleMappingModule[] = [{ id: "m3", name: "Module 03: Recursion" }];
    const folders = ["assignments/module_03", "assignments/module-3-redo"];

    const result = mapRepoFoldersToModules(folders, modules);

    expect(result.pairings).toHaveLength(2);
    for (const pairing of result.pairings) {
      expect(pairing.state).toBe("ambiguous");
      expect(pairing.matchedBy).toBe("number");
      expect(pairing.module).toBeNull();
      expect(pairing.candidates).toEqual([{ moduleId: "m3", moduleName: "Module 03: Recursion" }]);
    }
    // Each folder names the OTHER as its competitor, not itself.
    expect(result.pairings[0].competingFolders).toEqual(["assignments/module-3-redo"]);
    expect(result.pairings[1].competingFolders).toEqual(["assignments/module_03"]);

    // The contested module is not "unmapped" - both folders name it as a
    // candidate - but neither folder is confirmed to it.
    expect(result.unmappedModules).toHaveLength(0);
  });

  it("marks a folder's token score tie across modules ambiguous, listing every tied candidate", () => {
    // Both modules share exactly the token "assignment" with the folder
    // name, and neither shares anything else - a genuine tie.
    const modules: RepoModuleMappingModule[] = [
      { id: "ma", name: "Assignment Alpha" },
      { id: "mb", name: "Assignment Beta" },
    ];
    const result = mapRepoFoldersToModules(["assignments/assignment-work"], modules);

    expect(result.pairings[0].state).toBe("ambiguous");
    expect(result.pairings[0].matchedBy).toBe("token");
    expect(result.pairings[0].module).toBeNull();
    expect(result.pairings[0].candidates.map((c) => c.moduleId).sort()).toEqual(["ma", "mb"]);
  });
});

describe("mapRepoFoldersToModules - empty inputs", () => {
  it("returns no pairings and no unmapped modules when both sides are empty", () => {
    const result = mapRepoFoldersToModules([], []);
    expect(result.pairings).toEqual([]);
    expect(result.unmappedFolders).toEqual([]);
    expect(result.unmappedModules).toEqual([]);
  });

  it("reports every module unmapped when there are folders but no modules", () => {
    const result = mapRepoFoldersToModules(["assignments/module_01"], []);
    expect(result.pairings[0].state).toBe("unbound");
    expect(result.unmappedModules).toEqual([]);
  });

  it("reports every module unmapped and no pairings when there are modules but no folders", () => {
    const modules: RepoModuleMappingModule[] = [{ id: "m1", name: "Module 01: Intro" }];
    const result = mapRepoFoldersToModules([], modules);
    expect(result.pairings).toEqual([]);
    expect(result.unmappedModules).toEqual(modules);
  });
});

describe("applyRepoModuleOverrides", () => {
  it("lets an override beat an inferred pairing, including an ambiguous one", () => {
    const modules: RepoModuleMappingModule[] = [
      { id: "m3", name: "Module 03: Recursion" },
      { id: "m9", name: "Module 09: Elsewhere" },
    ];
    const folders = ["assignments/module_03", "assignments/module-3-redo"];
    const inferred = mapRepoFoldersToModules(folders, modules);
    expect(inferred.pairings[1].state).toBe("ambiguous");

    const overrides: RepoModuleOverrideMap = { "assignments/module-3-redo": "m9" };
    const result = applyRepoModuleOverrides(inferred, overrides, modules);

    const overridden = result.pairings.find((p) => p.folderPath === "assignments/module-3-redo");
    expect(overridden?.state).toBe("confirmed");
    expect(overridden?.matchedBy).toBe("override");
    expect(overridden?.module).toEqual({ moduleId: "m9", moduleName: "Module 09: Elsewhere" });
    expect(overridden?.overridden).toBe(true);

    // The other folder's inference is untouched.
    const untouched = result.pairings.find((p) => p.folderPath === "assignments/module_03");
    expect(untouched?.state).toBe("ambiguous");
    expect(untouched?.overridden).toBe(false);
  });

  it("is a no-op for an empty override map", () => {
    const modules: RepoModuleMappingModule[] = [{ id: "m1", name: "Module 01: Intro" }];
    const inferred = mapRepoFoldersToModules(["assignments/module_01"], modules);
    const result = applyRepoModuleOverrides(inferred, EMPTY_REPO_MODULE_OVERRIDES, modules);
    expect(result).toBe(inferred);
  });
});

describe("filterRepoModuleOverrides - restore-time filtering", () => {
  it("drops an override naming a folder that no longer exists", () => {
    const modules: RepoModuleMappingModule[] = [{ id: "m1", name: "Module 01: Intro" }];
    const overrides: RepoModuleOverrideMap = { "assignments/deleted-folder": "m1" };
    const result = filterRepoModuleOverrides(overrides, ["assignments/module_01"], modules);
    expect(result).toEqual({});
  });

  it("drops an override naming a module that no longer exists", () => {
    const modules: RepoModuleMappingModule[] = [{ id: "m1", name: "Module 01: Intro" }];
    const overrides: RepoModuleOverrideMap = { "assignments/module_01": "deleted-module" };
    const result = filterRepoModuleOverrides(overrides, ["assignments/module_01"], modules);
    expect(result).toEqual({});
  });

  it("keeps a valid override untouched, and returns the same reference when nothing was dropped", () => {
    const modules: RepoModuleMappingModule[] = [{ id: "m1", name: "Module 01: Intro" }];
    const overrides: RepoModuleOverrideMap = { "assignments/module_01": "m1" };
    const result = filterRepoModuleOverrides(overrides, ["assignments/module_01"], modules);
    expect(result).toBe(overrides);
  });
});
